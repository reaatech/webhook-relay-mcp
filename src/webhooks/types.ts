import type { Request } from 'express';

export interface WebhookSource {
  readonly name: string;
  readonly displayName: string;
  validateSignature(req: WebhookRequest, secret: string): Promise<boolean>;
  normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent>;
  getEventType(req: WebhookRequest): string;
  getWebhookId(req: WebhookRequest): string | undefined;
}

export interface NormalizedWebhookEvent {
  id: string;
  type: string;
  source: string;
  sourceType: string;
  sourceId?: string;
  timestamp: string;
  receivedAt: string;
  correlationId?: string | undefined;
  data: Record<string, unknown>;
  rawPayload: unknown;
  metadata: {
    webhookId?: string | undefined;
    [key: string]: unknown;
  };
  processed?: boolean;
}

export interface WebhookConfig {
  name: string;
  sourceType: string;
  signingSecret: string;
  isActive: boolean;
}

// Augmented Express Request with rawBody from raw-body middleware
export type WebhookRequest = Request & {
  rawBody?: Buffer;
};
