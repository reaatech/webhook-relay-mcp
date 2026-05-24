import crypto from 'node:crypto';
import { config } from '@reaatech/webhook-relay-core';
import { logger } from '@reaatech/webhook-relay-core';
import { incrementCounter } from '@reaatech/webhook-relay-core';
import { DatabaseService } from '../database.js';
import type { EventEntity } from '../repositories/events.js';

function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export class DeliveryService {
  private static instance: DeliveryService;

  static getInstance(): DeliveryService {
    if (!DeliveryService.instance) {
      DeliveryService.instance = new DeliveryService();
    }
    return DeliveryService.instance;
  }

  async deliverEvent(
    event: EventEntity,
    destinationUrl: string,
    signingSecret: string,
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const payload = JSON.stringify({
      id: event.id,
      type: event.type,
      source: event.source,
      sourceType: event.sourceType,
      timestamp: event.timestamp,
      correlationId: event.correlationId,
      data: event.data,
    });

    const signature = generateSignature(payload, signingSecret);

    try {
      const response = await fetch(destinationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
        },
        body: payload,
      });

      if (response.ok) {
        incrementCounter('webhook_delivery_total', { status: 'success' });
        return { success: true, statusCode: response.status };
      }

      incrementCounter('webhook_delivery_total', { status: 'failed' });
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}`,
      };
    } catch (err) {
      incrementCounter('webhook_delivery_total', { status: 'error' });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async processDeliveryQueue(): Promise<{ attempted: number; succeeded: number; dead: number }> {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();

    const retryableEvents = db
      .prepare(
        `SELECT * FROM events
         WHERE delivery_status IN ('pending', 'failed')
           AND (next_retry_at IS NULL OR next_retry_at <= ?)
           AND retry_count < ?
         ORDER BY received_at ASC
         LIMIT 50`,
      )
      .all(now, config.deliveryRetryMax) as Record<string, unknown>[];

    if (retryableEvents.length === 0) {
      return { attempted: 0, succeeded: 0, dead: 0 };
    }

    let attempted = 0;
    const succeeded = 0;
    let dead = 0;

    for (const row of retryableEvents) {
      attempted++;

      const nextRetryAttempt = ((row.retry_count as number) ?? 0) + 1;

      if (nextRetryAttempt >= config.deliveryRetryMax) {
        db.prepare(
          'UPDATE events SET delivery_status = ?, retry_count = ?, last_error = ?, next_retry_at = NULL WHERE id = ?',
        ).run('dead', nextRetryAttempt, 'Max retries exceeded', row.id as string);
        dead++;
      } else {
        const nextRetryAt = new Date(
          Date.now() + config.deliveryRetryBackoffMs * 2 ** (nextRetryAttempt - 1),
        ).toISOString();

        db.prepare(
          'UPDATE events SET delivery_status = ?, retry_count = ?, next_retry_at = ? WHERE id = ?',
        ).run('failed', nextRetryAttempt, nextRetryAt, row.id as string);
      }
    }

    logger.info({ attempted, succeeded, dead }, 'Delivery queue processed');
    return { attempted, succeeded, dead };
  }
}
