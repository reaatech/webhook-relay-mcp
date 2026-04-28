# Skill: Webhook Integration

## Description

This skill handles adding new webhook sources to webhook-relay-mcp. It covers signature verification, payload normalization, and event routing for external services like Stripe, GitHub, Replicate, and Twilio.

## Capabilities

- Implement signature verification for various webhook providers
- Create payload normalizers to transform source-specific formats to unified schema
- Set up HTTP endpoints for webhook ingestion
- Configure event type mapping and categorization
- Handle webhook retries and idempotency
- Test webhook integrations with real payloads

## Required Context

- **Project**: webhook-relay-mcp
- **Architecture**: See ARCHITECTURE.md webhook processing layer
- **Dependencies**: express, crypto, zod, better-sqlite3
- **Existing Skills**: architecture-setup, database-design

## Implementation Steps

### 1. Webhook Source Interface

Create `src/webhooks/types.ts`:
```typescript
import { Request, Response } from 'express';

export interface WebhookSource {
  /** Unique identifier for this source type */
  readonly name: string;
  
  /** Display name for documentation */
  readonly displayName: string;
  
  /** Validate the webhook signature */
  validateSignature(req: Request, secret: string): Promise<boolean>;
  
  /** Normalize the raw payload to standard event format */
  normalizePayload(req: Request): Promise<NormalizedWebhookEvent>;
  
  /** Get the webhook event type from the request */
  getEventType(req: Request): string;
  
  /** Extract the webhook ID for deduplication */
  getWebhookId(req: Request): string | undefined;
}

export interface NormalizedWebhookEvent {
  /** Unique event ID (ULID) */
  id: string;
  
  /** Normalized event type (e.g., "payment.completed") */
  type: string;
  
  /** Source identifier (e.g., "stripe") */
  source: string;
  
  /** Original event type from source */
  sourceType: string;
  
  /** When the event occurred at the source */
  timestamp: string;
  
  /** When we received the webhook */
  receivedAt: string;
  
  /** Correlation ID for tracing */
  correlationId?: string;
  
  /** Normalized event data */
  data: Record<string, unknown>;
  
  /** Original raw payload */
  rawPayload: unknown;
  
  /** Source-specific metadata */
  metadata: {
    webhookId?: string;
    [key: string]: unknown;
  };
}

export interface WebhookConfig {
  name: string;
  sourceType: string;
  signingSecret: string;
  isActive: boolean;
}
```

### 2. Base Validator Implementation

Create `src/webhooks/validators/base.ts`:
```typescript
import crypto from 'crypto';

export interface SignatureValidator {
  validate(payload: Buffer, signature: string, secret: string): Promise<boolean>;
}

export class HMACSignatureValidator implements SignatureValidator {
  constructor(
    private algorithm: 'sha256' | 'sha1' = 'sha256',
    private prefix: string = ''
  ) {}

  async validate(payload: Buffer, signature: string, secret: string): Promise<boolean> {
    const expectedSignature = this.computeSignature(payload, secret);
    
    // Remove prefix if present
    const cleanSignature = signature.replace(`${this.prefix}=`, '');
    
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  private computeSignature(payload: Buffer, secret: string): string {
    return crypto
      .createHmac(this.algorithm, secret)
      .update(payload)
      .digest('hex');
  }
}

export class StripeSignatureValidator implements SignatureValidator {
  private readonly tolerance: number = 300; // 5 minutes

  async validate(payload: Buffer, signature: string, secret: string): Promise<boolean> {
    // Stripe signature format: t=timestamp,v1=hmac_signature
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      throw new Error('Invalid Stripe signature format');
    }

    const timestamp = parseInt(timestampPart.substring(2), 10);
    const signedPayload = `${timestamp}.${payload.toString()}`;
    
    // Check timestamp tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > this.tolerance) {
      throw new Error('Webhook signature timestamp outside tolerance');
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    const providedSignature = signaturePart.substring(3);

    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }
}

export class GitHubSignatureValidator implements SignatureValidator {
  async validate(payload: Buffer, signature: string, secret: string): Promise<boolean> {
    // GitHub signature format: sha256=hex_signature
    const hmac = crypto.createHmac('sha256', secret);
    const expectedSignature = `sha256=${hmac.update(payload).digest('hex')}`;
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

export class TwilioSignatureValidator implements SignatureValidator {
  async validate(url: string, payload: Buffer, signature: string, authToken: string): Promise<boolean> {
    // Twilio uses a different approach: validate signature of URL + sorted params
    const sortedParams = this.sortAndConcatenateParams(payload);
    const data = url + sortedParams;
    
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(data)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private sortAndConcatenateParams(payload: Buffer): string {
    const params = new URLSearchParams(payload.toString());
    const sortedKeys = Array.from(params.keys()).sort();
    return sortedKeys.map(key => `${key}${params.get(key) || ''}`).join('');
  }
}
```

### 3. Stripe Integration

Create `src/webhooks/sources/stripe.ts`:
```typescript
import { Request } from 'express';
import { ulid } from 'ulid';
import { WebhookSource, NormalizedWebhookEvent } from '../types.js';
import { StripeSignatureValidator } from '../validators/base.js';

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
  api_version?: string;
}

// Type mapping from Stripe events to normalized events
const STRIPE_TYPE_MAP: Record<string, string> = {
  // Payment events
  'invoice.payment_succeeded': 'payment.completed',
  'invoice.payment_failed': 'payment.failed',
  'payment_intent.succeeded': 'payment.completed',
  'payment_intent.payment_failed': 'payment.failed',
  'charge.succeeded': 'payment.completed',
  'charge.failed': 'payment.failed',
  
  // Subscription events
  'customer.subscription.created': 'subscription.created',
  'customer.subscription.updated': 'subscription.updated',
  'customer.subscription.deleted': 'subscription.deleted',
  'customer.subscription.paused': 'subscription.paused',
  'customer.subscription.resumed': 'subscription.resumed',
  
  // Customer events
  'customer.created': 'customer.created',
  'customer.updated': 'customer.updated',
  'customer.deleted': 'customer.deleted',
  
  // Checkout events
  'checkout.session.completed': 'checkout.completed',
  'checkout.session.async_payment_succeeded': 'payment.completed',
  'checkout.session.async_payment_failed': 'payment.failed',
  
  // Refund events
  'charge.refunded': 'refund.created',
  'charge.refund.updated': 'refund.updated',
};

export class StripeWebhookSource implements WebhookSource {
  readonly name = 'stripe';
  readonly displayName = 'Stripe';
  private readonly validator = new StripeSignatureValidator();

  async validateSignature(req: Request, secret: string): Promise<boolean> {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      throw new Error('Missing Stripe-Signature header');
    }

    return this.validator.validate(req.rawBody as Buffer, signature, secret);
  }

  async normalizePayload(req: Request): Promise<NormalizedWebhookEvent> {
    const stripeEvent = req.body as StripeEvent;
    const sourceType = stripeEvent.type;
    const normalizedType = STRIPE_TYPE_MAP[sourceType] ?? `stripe.${sourceType}`;
    
    const timestamp = new Date(stripeEvent.created * 1000).toISOString();
    const receivedAt = new Date().toISOString();

    // Extract relevant data based on event type
    const data = this.extractEventData(stripeEvent);

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: this.extractCorrelationId(stripeEvent),
      data,
      rawPayload: stripeEvent,
      metadata: {
        webhookId: stripeEvent.id,
        apiVersion: stripeEvent.api_version,
        attemptNumber: req.headers['stripe-notification-attempt'] 
          ? parseInt(req.headers['stripe-notification-attempt'] as string, 10)
          : 1,
      },
    };
  }

  getEventType(req: Request): string {
    const stripeEvent = req.body as StripeEvent;
    return STRIPE_TYPE_MAP[stripeEvent.type] ?? `stripe.${stripeEvent.type}`;
  }

  getWebhookId(req: Request): string | undefined {
    const stripeEvent = req.body as StripeEvent;
    return stripeEvent.id;
  }

  private extractEventData(event: StripeEvent): Record<string, unknown> {
    const object = event.data.object;
    
    // Common fields across different event types
    const baseData: Record<string, unknown> = {
      stripeEventId: event.id,
      stripeEventType: event.type,
    };

    // Add event-specific data
    switch (event.type) {
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        baseData.customerId = object.customer as string;
        baseData.amount = (object as { amount_due?: number }).amount_due;
        baseData.currency = (object as { currency?: string }).currency;
        baseData.invoiceId = object.id as string;
        break;

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        baseData.customerId = (object as { customer?: string }).customer;
        baseData.amount = (object as { amount?: number }).amount;
        baseData.currency = (object as { currency?: string }).currency;
        baseData.paymentIntentId = object.id as string;
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        baseData.customerId = (object as { customer?: string }).customer;
        baseData.subscriptionId = object.id as string;
        baseData.status = (object as { status?: string }).status;
        baseData.planId = (object as { plan?: { id?: string } }).plan?.id;
        break;

      case 'checkout.session.completed':
        baseData.customerId = (object as { customer?: string }).customer;
        baseData.sessionId = object.id as string;
        baseData.amountTotal = (object as { amount_total?: number }).amount_total;
        baseData.currency = (object as { currency?: string }).currency;
        baseData.paymentStatus = (object as { payment_status?: string }).payment_status;
        break;

      default:
        // For unmapped events, include the full object
        baseData.object = object;
    }

    return baseData;
  }

  private extractCorrelationId(event: StripeEvent): string | undefined {
    // Use the object ID as correlation ID for tracing
    const object = event.data.object as { id?: string };
    return object.id;
  }
}
```

### 4. GitHub Integration

Create `src/webhooks/sources/github.ts`:
```typescript
import { Request } from 'express';
import { ulid } from 'ulid';
import { WebhookSource, NormalizedWebhookEvent } from '../types.js';
import { GitHubSignatureValidator } from '../validators/base.js';

interface GitHubWebhookPayload {
  action: string;
  [key: string]: unknown;
}

const GITHUB_TYPE_MAP: Record<string, string> = {
  // Push events
  'push': 'code.push',
  'pull_request.opened': 'code.pull_request.opened',
  'pull_request.closed': 'code.pull_request.closed',
  'pull_request.merged': 'code.pull_request.merged',
  
  // Workflow events
  'workflow_run.completed': 'ci.workflow.completed',
  'workflow_run.requested': 'ci.workflow.started',
  'check_run.completed': 'ci.check_run.completed',
  
  // Release events
  'release.published': 'release.published',
  'release.created': 'release.created',
  
  // Issue events
  'issues.opened': 'issue.opened',
  'issues.closed': 'issue.closed',
  'issue_comment.created': 'issue.comment.created',
  
  // Deployment events
  'deployment_status.completed': 'deployment.completed',
  'deployment_status.started': 'deployment.started',
};

export class GitHubWebhookSource implements WebhookSource {
  readonly name = 'github';
  readonly displayName = 'GitHub';
  private readonly validator = new GitHubSignatureValidator();

  async validateSignature(req: Request, secret: string): Promise<boolean> {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      throw new Error('Missing X-Hub-Signature-256 header');
    }

    return this.validator.validate(req.rawBody as Buffer, signature, secret);
  }

  async normalizePayload(req: Request): Promise<NormalizedWebhookEvent> {
    const githubEvent = req.headers['x-github-event'] as string;
    const payload = req.body as GitHubWebhookPayload;
    const sourceType = `${githubEvent}.${payload.action}`;
    const normalizedType = GITHUB_TYPE_MAP[sourceType] ?? `github.${sourceType}`;

    const timestamp = req.headers['x-github-delivered-at'] as string 
      ?? new Date().toISOString();
    const receivedAt = new Date().toISOString();

    const data = this.extractEventData(githubEvent, payload);
    const correlationId = this.extractCorrelationId(githubEvent, payload);

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId,
      data,
      rawPayload: payload,
      metadata: {
        webhookId: req.headers['x-github-delivery'] as string,
        repository: (payload.repository as { full_name?: string })?.full_name,
        sender: (payload.sender as { login?: string })?.login,
        installation: (payload.installation as { id?: number })?.id,
      },
    };
  }

  getEventType(req: Request): string {
    const githubEvent = req.headers['x-github-event'] as string;
    const payload = req.body as GitHubWebhookPayload;
    const sourceType = `${githubEvent}.${payload.action}`;
    return GITHUB_TYPE_MAP[sourceType] ?? `github.${sourceType}`;
  }

  getWebhookId(req: Request): string | undefined {
    return req.headers['x-github-delivery'] as string;
  }

  private extractEventData(event: string, payload: GitHubWebhookPayload): Record<string, unknown> {
    const data: Record<string, unknown> = {
      action: payload.action,
      githubEvent: event,
    };

    // Add event-specific data
    switch (event) {
      case 'push':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.ref = payload.ref as string;
        data.before = payload.before as string;
        data.after = payload.after as string;
        data.commitCount = (payload.commits as unknown[] | undefined)?.length ?? 0;
        data.pusher = (payload.pusher as { name?: string })?.name;
        break;

      case 'pull_request':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.number = (payload.number as number | undefined) ?? (payload.pull_request as { number?: number })?.number;
        data.state = (payload.pull_request as { state?: string })?.state;
        data.title = (payload.pull_request as { title?: string })?.title;
        data.branch = (payload.pull_request as { head?: { ref?: string } })?.head?.ref;
        break;

      case 'workflow_run':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.workflowId = (payload.workflow_run as { workflow_id?: number })?.workflow_id;
        data.status = (payload.workflow_run as { status?: string })?.status;
        data.conclusion = (payload.workflow_run as { conclusion?: string })?.conclusion;
        data.branch = (payload.workflow_run as { head_branch?: string })?.head_branch;
        break;

      case 'release':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.tagName = (payload.release as { tag_name?: string })?.tag_name;
        data.releaseName = (payload.release as { name?: string })?.name;
        data.draft = (payload.release as { draft?: boolean })?.draft;
        data.prerelease = (payload.release as { prerelease?: boolean })?.prerelease;
        break;

      case 'deployment_status':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.state = (payload.deployment_status as { state?: string })?.state;
        data.environment = (payload.deployment as { environment?: string })?.environment;
        break;

      default:
        data.repository = (payload.repository as { full_name?: string })?.full_name;
    }

    return data;
  }

  private extractCorrelationId(event: string, payload: GitHubWebhookPayload): string | undefined {
    switch (event) {
      case 'pull_request':
        return String((payload.pull_request as { id?: number })?.id ?? '');
      case 'workflow_run':
        return String((payload.workflow_run as { id?: number })?.id ?? '');
      case 'release':
        return String((payload.release as { id?: number })?.id ?? '');
      default:
        return undefined;
    }
  }
}
```

### 5. Replicate Integration

Create `src/webhooks/sources/replicate.ts`:
```typescript
import { Request } from 'express';
import { ulid } from 'ulid';
import crypto from 'crypto';
import { WebhookSource, NormalizedWebhookEvent } from '../types.js';

interface ReplicateWebhookPayload {
  id: string;
  version: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  logs?: string;
  metrics?: {
    predict_time?: number;
  };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  urls?: {
    get?: string;
    cancel?: string;
  };
  webhook_completed?: boolean;
}

const REPLICATE_TYPE_MAP: Record<string, string> = {
  'prediction.created': 'prediction.created',
  'prediction.started': 'prediction.started',
  'prediction.completed': 'prediction.completed',
  'prediction.failed': 'prediction.failed',
  'prediction.canceled': 'prediction.canceled',
  'training.created': 'training.created',
  'training.completed': 'training.completed',
  'training.failed': 'training.failed',
};

export class ReplicateWebhookSource implements WebhookSource {
  readonly name = 'replicate';
  readonly displayName = 'Replicate';

  async validateSignature(req: Request, secret: string): Promise<boolean> {
    const signature = req.headers['webhook-secret'] as string;
    if (!signature) {
      // Replicate webhooks may not always have signatures
      return true;
    }

    const hmac = crypto.createHmac('sha256', secret);
    const expectedSignature = hmac.update(req.rawBody as Buffer).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  async normalizePayload(req: Request): Promise<NormalizedWebhookEvent> {
    const payload = req.body as ReplicateWebhookPayload;
    const sourceType = this.determineEventType(payload);
    const normalizedType = REPLICATE_TYPE_MAP[sourceType] ?? `replicate.${sourceType}`;

    const timestamp = payload.completed_at ?? payload.started_at ?? payload.created_at;
    const receivedAt = new Date().toISOString();

    const data = this.extractEventData(payload);

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: payload.id,
      data,
      rawPayload: payload,
      metadata: {
        predictionId: payload.id,
        version: payload.version,
        status: payload.status,
        predictTime: payload.metrics?.predict_time,
      },
    };
  }

  getEventType(req: Request): string {
    const payload = req.body as ReplicateWebhookPayload;
    const sourceType = this.determineEventType(payload);
    return REPLICATE_TYPE_MAP[sourceType] ?? `replicate.${sourceType}`;
  }

  getWebhookId(req: Request): string | undefined {
    const payload = req.body as ReplicateWebhookPayload;
    return payload.id;
  }

  private determineEventType(payload: ReplicateWebhookPayload): string {
    // Replicate doesn't send an explicit event type, we derive it from status
    switch (payload.status) {
      case 'starting':
        return 'prediction.started';
      case 'processing':
        return 'prediction.processing';
      case 'succeeded':
        return 'prediction.completed';
      case 'failed':
        return 'prediction.failed';
      case 'canceled':
        return 'prediction.canceled';
      default:
        return `prediction.${payload.status}`;
    }
  }

  private extractEventData(payload: ReplicateWebhookPayload): Record<string, unknown> {
    return {
      predictionId: payload.id,
      version: payload.version,
      status: payload.status,
      input: payload.input,
      output: payload.output,
      error: payload.error,
      metrics: payload.metrics,
      urls: payload.urls,
      createdAt: payload.created_at,
      startedAt: payload.started_at,
      completedAt: payload.completed_at,
      predictTime: payload.metrics?.predict_time,
    };
  }
}
```

### 6. Webhook Source Registry

Create `src/webhooks/sources/index.ts`:
```typescript
import { WebhookSource } from '../types.js';
import { StripeWebhookSource } from './stripe.js';
import { GitHubWebhookSource } from './github.js';
import { ReplicateWebhookSource } from './replicate.js';

export const webhookSources: Record<string, new () => WebhookSource> = {
  stripe: StripeWebhookSource,
  github: GitHubWebhookSource,
  replicate: ReplicateWebhookSource,
};

export function getWebhookSource(sourceType: string): WebhookSource | undefined {
  const SourceClass = webhookSources[sourceType];
  return SourceClass ? new SourceClass() : undefined;
}

export function registerWebhookSource(name: string, source: new () => WebhookSource): void {
  webhookSources[name] = source;
}

export { StripeWebhookSource } from './stripe.js';
export { GitHubWebhookSource } from './github.js';
export { ReplicateWebhookSource } from './replicate.js';
```

### 7. Raw Body Middleware

Signature validators need the raw request body. Express's `express.json()` middleware provides parsed objects. Use `raw-body` to capture the raw buffer before parsing.

Create `src/middleware/rawBody.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import getRawBody from 'raw-body';

export async function rawBodyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Only capture raw body for webhook routes
  if (!req.path.startsWith('/webhooks/')) {
    return next();
  }

  try {
    const rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
    });

    (req as Request & { rawBody: Buffer }).rawBody = rawBody;

    // Parse JSON manually so req.body is still available
    if (req.headers['content-type']?.includes('application/json')) {
      req.body = JSON.parse(rawBody.toString('utf-8'));
    } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      req.body = Object.fromEntries(new URLSearchParams(rawBody.toString('utf-8')));
    }

    next();
  } catch (error) {
    next(error);
  }
}
```

Register in `src/server.ts` **before** any other body parsers:
```typescript
import { rawBodyMiddleware } from './middleware/rawBody.js';

app.use(rawBodyMiddleware);
```

### 8. HTTP Ingestion Endpoint

Create `src/webhooks/ingest.ts`:
```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { StorageService } from '../storage/index.js';
import { getWebhookSource } from './sources/index.js';
import { NormalizedWebhookEvent } from './types.js';
import { notifyPollWaiters } from '../mcp/tools/poll.js';

const router = Router();

// Validation schema for webhook source registration
const sourceConfigSchema = z.object({
  name: z.string().min(1).max(100),
  sourceType: z.string().min(1).max(50),
  signingSecret: z.string().min(1),
});

// POST /webhooks/:source
router.post('/:source', async (req: Request, res: Response) => {
  const { source } = req.params;
  const requestId = req.headers['x-request-id'] as string ?? crypto.randomUUID();

  logger.info({
    event: 'webhook_received',
    requestId,
    source,
    userAgent: req.get('user-agent'),
  }, 'Webhook received');

  try {
    // Get webhook source handler
    const webhookSource = getWebhookSource(source);
    if (!webhookSource) {
      logger.warn({ event: 'unknown_source', source }, 'Unknown webhook source');
      return res.status(404).json({ error: 'Unknown webhook source' });
    }

    // Get source configuration from database
    const storage = StorageService.getInstance();
    const sourceConfig = await storage.sources.findByName(source);
    
    if (!sourceConfig || !sourceConfig.isActive) {
      logger.warn({ event: 'source_not_configured', source }, 'Webhook source not configured');
      return res.status(404).json({ error: 'Webhook source not configured' });
    }

    // Validate signature
    try {
      await webhookSource.validateSignature(req, sourceConfig.signingSecret);
    } catch (error) {
      logger.warn({
        event: 'signature_validation_failed',
        source,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Signature validation failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Check for duplicate webhook using webhook ID + source as dedup key
    const webhookId = webhookSource.getWebhookId(req);
    if (webhookId) {
      const existing = await storage.events.list({
        sources: [sourceConfig.sourceType],
        limit: 1,
        orderBy: 'received_at',
        order: 'DESC',
      });
      const duplicate = existing.find(e =>
        e.metadata?.webhookId === webhookId &&
        e.source === sourceConfig.sourceType
      );
      if (duplicate) {
        logger.info({ event: 'duplicate_webhook', source, webhookId }, 'Duplicate webhook, skipping');
        return res.status(200).json({ status: 'duplicate' });
      }
    }

    // Normalize payload
    const normalizedEvent = await webhookSource.normalizePayload(req);

    // Store event
    await storage.events.create({
      ...normalizedEvent,
      sourceId: sourceConfig.id,
    });

    // Notify waiting poll subscribers
    await notifyPollWaiters(normalizedEvent, storage);

    logger.info({
      event: 'webhook_processed',
      requestId,
      source,
      eventType: normalizedEvent.type,
      eventId: normalizedEvent.id,
    }, 'Webhook processed successfully');

    res.status(202).json({
      status: 'accepted',
      eventId: normalizedEvent.id,
    });

  } catch (error) {
    logger.error({
      event: 'webhook_processing_error',
      requestId,
      source,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Error processing webhook');

    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /webhooks/:source/verify - For webhook setup verification
router.get('/:source/verify', async (req: Request, res: Response) => {
  const { source } = req.params;
  const webhookSource = getWebhookSource(source);

  if (!webhookSource) {
    return res.status(404).json({ error: 'Unknown webhook source' });
  }

  // Some providers send a verification request
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.challenge']) {
    return res.send(req.query['hub.challenge']);
  }

  res.status(200).json({ status: 'ok', source: webhookSource.displayName });
});

export { router as webhookRouter };
```

## Best Practices

1. **Always validate signatures** before processing webhooks
2. **Use constant-time comparison** for signature validation to prevent timing attacks
3. **Handle duplicates** using webhook IDs provided by services
4. **Store raw payloads** for debugging and replay
5. **Implement idempotency** using correlation IDs
6. **Log all webhook activity** with structured logging
7. **Return appropriate HTTP status codes** (202 for accepted, 401 for auth failures)
8. **Test with real webhook payloads** from each provider
9. **Handle webhook retries** gracefully (providers retry on failures)
10. **Monitor webhook health** and alert on validation failures

## Testing Webhooks

### Test Stripe Webhook
```bash
# Using Stripe CLI
stripe trigger invoice.payment_succeeded \
  --add-payment_intent:customer=cus_test123

# Verify the webhook was received
curl http://localhost:3000/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=signature" \
  -d '{"id":"evt_123","type":"invoice.payment_succeeded","created":1234567890,"data":{"object":{"id":"in_123","customer":"cus_123","amount_due":5000,"currency":"usd"}}}'
```

### Test GitHub Webhook
```bash
# Using GitHub CLI or webhooks
curl http://localhost:3000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: delivery-123" \
  -H "X-Hub-Signature-256: sha256=signature" \
  -d '{"action":"created","repository":{"full_name":"test/repo"},"ref":"main"}'
```

## Related Skills

- **database-design**: For storing webhook events
- **security-hardening**: For advanced signature validation
- **mcp-tools**: For exposing webhook data to agents
- **testing-strategy**: For webhook integration testing

## Dependencies

This skill requires:
- Architecture setup (project structure)
- Database design (event storage)
- Express server configuration

It enables:
- MCP tools (providing event data)
- API development (webhook endpoints)
- Full webhook-to-agent event flow
