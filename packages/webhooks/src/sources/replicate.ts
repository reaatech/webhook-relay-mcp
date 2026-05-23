import { ulid } from 'ulid';
import crypto from 'crypto';
import type { WebhookSource, NormalizedWebhookEvent, WebhookRequest } from '../types.js';

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
  'prediction.processing': 'prediction.processing',
  'prediction.completed': 'prediction.completed',
  'prediction.failed': 'prediction.failed',
  'prediction.canceled': 'prediction.canceled',
};

export class ReplicateWebhookSource implements WebhookSource {
  readonly name = 'replicate';
  readonly displayName = 'Replicate';

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['webhook-secret'] as string;
    if (!signature) {
      throw new Error('Missing webhook-secret header');
    }

    const hmac = crypto.createHmac('sha256', secret);
    const expectedSignature = hmac.update(req.rawBody as Buffer).digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const payload = req.body as ReplicateWebhookPayload;
    const sourceType = this.determineEventType(payload);
    const normalizedType = REPLICATE_TYPE_MAP[sourceType] ?? `replicate.${sourceType}`;
    const timestamp = payload.completed_at ?? payload.started_at ?? payload.created_at;
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: payload.id,
      data: this.extractEventData(payload),
      rawPayload: payload,
      metadata: {
        predictionId: payload.id,
        version: payload.version,
        status: payload.status,
        predictTime: payload.metrics?.predict_time,
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const payload = req.body as ReplicateWebhookPayload;
    const sourceType = this.determineEventType(payload);
    return REPLICATE_TYPE_MAP[sourceType] ?? `replicate.${sourceType}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    const payload = req.body as ReplicateWebhookPayload;
    return payload.id;
  }

  private determineEventType(payload: ReplicateWebhookPayload): string {
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
