import { ulid } from 'ulid';
import type { WebhookSource, NormalizedWebhookEvent, WebhookRequest } from '../types.js';
import { HMACSignatureValidator } from '../validators/base.js';

export class GenericWebhookSource implements WebhookSource {
  readonly name = 'generic';
  readonly displayName = 'Generic';

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['x-signature'] as string;
    if (!signature) {
      throw new Error('Missing x-signature header');
    }

    const algorithm = (req.headers['x-signature-algorithm'] as 'sha256' | 'sha1') ?? 'sha256';
    const prefix = (req.headers['x-signature-prefix'] as string) ?? '';
    const validator = new HMACSignatureValidator(algorithm, prefix);

    return validator.validate(req.rawBody as Buffer, signature, secret);
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const payload = req.body as Record<string, unknown>;
    const eventType = (payload.event as string) ?? (payload.type as string) ?? 'unknown';
    const timestamp = (payload.timestamp as string) ?? new Date().toISOString();
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: `generic.${eventType}`,
      source: this.name,
      sourceType: eventType,
      timestamp,
      receivedAt,
      correlationId: (payload.id as string) ?? undefined,
      data: payload,
      rawPayload: payload,
      metadata: {
        webhookId: (payload.id as string) ?? undefined,
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const payload = req.body as Record<string, unknown>;
    const eventType = (payload.event as string) ?? (payload.type as string) ?? 'unknown';
    return `generic.${eventType}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    const payload = req.body as Record<string, unknown>;
    return (payload.id as string) ?? undefined;
  }
}
