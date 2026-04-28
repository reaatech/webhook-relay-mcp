import { Router, type Response } from 'express';
import type { WebhookRequest } from './types.js';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { StorageService } from '../storage/index.js';
import { notifyPollWaiters } from '../mcp/tools/poll.js';
import { getWebhookSource } from './sources/index.js';
import { decryptSecret } from '../utils/crypto.js';
import { SignatureVerificationError } from '../utils/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router: import('express').Router = Router();

router.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMaxRequests,
  })
);

router.post('/:name', async (req: WebhookRequest, res: Response) => {
  const name = req.params.name as string;
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();

  logger.info(
    {
      event: 'webhook_received',
      requestId,
      name,
      userAgent: req.get('user-agent') ?? 'unknown',
    },
    'Webhook received'
  );

  try {
    const storage = StorageService.getInstance();
    const sourceConfig = await storage.sources.findByName(name);

    if (!sourceConfig || !sourceConfig.isActive) {
      logger.warn({ event: 'source_not_configured', name }, 'Webhook source not configured');
      res.status(404).json({ error: 'Webhook source not configured' });
      return;
    }

    // Look up the source-specific handler
    const webhookSource = getWebhookSource(sourceConfig.sourceType);
    if (!webhookSource) {
      logger.warn(
        { event: 'unknown_source_type', sourceType: sourceConfig.sourceType },
        'Unknown webhook source type'
      );
      res.status(404).json({ error: 'Unknown webhook source type' });
      return;
    }

    // Validate signature
    try {
      const secret = decryptSecret(sourceConfig.signingSecret);
      const valid = await webhookSource.validateSignature(req, secret);
      if (!valid) {
        throw new SignatureVerificationError('Signature verification returned false');
      }
    } catch (error) {
      logger.warn(
        {
          event: 'signature_validation_failed',
          name,
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Signature validation failed'
      );
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Check for duplicate webhook
    const webhookId = webhookSource.getWebhookId(req);
    if (webhookId) {
      const duplicate = await storage.events.findByWebhookId(sourceConfig.sourceType, webhookId);
      if (duplicate) {
        logger.info({ event: 'duplicate_webhook', name, webhookId }, 'Duplicate webhook, skipping');
        res.status(200).json({ status: 'duplicate' });
        return;
      }
    }

    // Normalize payload
    const normalizedEvent = await webhookSource.normalizePayload(req);

    // Build event entity with all required fields
    const eventEntity = {
      type: normalizedEvent.type,
      source: normalizedEvent.source,
      sourceType: normalizedEvent.sourceType,
      sourceId: sourceConfig.id,
      webhookId: webhookId ?? null,
      timestamp: normalizedEvent.timestamp,
      receivedAt: normalizedEvent.receivedAt,
      correlationId: normalizedEvent.correlationId,
      data: normalizedEvent.data,
      rawPayload: normalizedEvent.rawPayload,
      metadata: normalizedEvent.metadata,
      processed: false,
    };

    // Store event
    const storedEvent = await storage.events.create(eventEntity);
    await notifyPollWaiters(storedEvent, storage);

    logger.info(
      {
        event: 'webhook_processed',
        requestId,
        name,
        eventType: normalizedEvent.type,
        eventId: normalizedEvent.id,
      },
      'Webhook processed successfully'
    );

    res.status(202).json({
      status: 'accepted',
      eventId: normalizedEvent.id,
    });
  } catch (error) {
    logger.error(
      {
        event: 'webhook_processing_error',
        requestId,
        name,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Error processing webhook'
    );

    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:name/verify', async (req: WebhookRequest, res: Response) => {
  const { name } = req.params;

  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.challenge']) {
    res.send(req.query['hub.challenge']);
    return;
  }

  res.status(200).json({ status: 'ok', name });
});

export { router as webhookRouter };
