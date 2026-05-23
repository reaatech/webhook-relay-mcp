export interface NormalizedEvent {
  id: string;
  type: string;
  source: string;
  sourceType: string;
  timestamp: string;
  receivedAt: string;
  correlationId?: string;
  data: Record<string, unknown>;
  rawPayload: unknown;
  metadata: {
    webhookId?: string;
    attemptNumber?: number;
    [key: string]: unknown;
  };
}

export interface NormalizationContext {
  source: string;
  sourceType: string;
  headers: Record<string, string>;
  receivedAt: Date;
}
