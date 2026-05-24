import { ulid } from 'ulid';
import type { NormalizedWebhookEvent, WebhookRequest, WebhookSource } from '../types.js';
import { HMACSignatureValidator } from '../validators/base.js';

interface SendGridEvent {
  sg_event_id?: string;
  sg_message_id?: string;
  event: string;
  email: string;
  timestamp: number;
  category?: string | string[];
  [key: string]: unknown;
}

const SENDGRID_TYPE_MAP: Record<string, string> = {
  delivered: 'email.delivered',
  open: 'email.opened',
  click: 'email.clicked',
  bounce: 'email.bounced',
  dropped: 'email.dropped',
  spamreport: 'email.spam_reported',
  unsubscribe: 'email.unsubscribed',
  group_unsubscribe: 'email.group_unsubscribed',
  group_resubscribe: 'email.group_resubscribed',
  processed: 'email.processed',
  deferred: 'email.deferred',
};

export class SendGridWebhookSource implements WebhookSource {
  readonly name = 'sendgrid';
  readonly displayName = 'SendGrid';
  private readonly validator = new HMACSignatureValidator();

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['x-sendgrid-signature'] as string;
    if (!signature) {
      throw new Error('Missing X-SendGrid-Signature header');
    }
    return this.validator.validate(req.rawBody as Buffer, signature, secret);
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const events = (Array.isArray(req.body) ? req.body : [req.body]) as SendGridEvent[];
    const firstEvent = events[0];
    if (!firstEvent) {
      throw new Error('Empty SendGrid event payload');
    }

    const sourceType = firstEvent.event;
    const normalizedType = SENDGRID_TYPE_MAP[sourceType] ?? `email.${sourceType}`;
    const timestamp = new Date(firstEvent.timestamp * 1000).toISOString();
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: firstEvent.sg_message_id,
      data: this.extractEventData(firstEvent),
      rawPayload: events.length === 1 ? firstEvent : events,
      metadata: {
        webhookId: firstEvent.sg_event_id ?? firstEvent.sg_message_id,
        email: firstEvent.email,
        category: firstEvent.category,
        eventCount: events.length,
        eventTypes: events.map((e) => e.event),
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const events = (Array.isArray(req.body) ? req.body : [req.body]) as SendGridEvent[];
    const sourceType = events[0]?.event ?? 'unknown';
    return SENDGRID_TYPE_MAP[sourceType] ?? `email.${sourceType}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    const events = (Array.isArray(req.body) ? req.body : [req.body]) as SendGridEvent[];
    return events[0]?.sg_event_id ?? events[0]?.sg_message_id;
  }

  private extractEventData(event: SendGridEvent): Record<string, unknown> {
    const data: Record<string, unknown> = {
      email: event.email,
      sgEventId: event.sg_event_id,
      sgMessageId: event.sg_message_id,
      eventType: event.event,
      category: event.category,
    };

    switch (event.event) {
      case 'delivered':
        data.response = event.response as string;
        break;

      case 'open':
        data.userAgent = event.useragent as string;
        data.ip = event.ip as string;
        break;

      case 'click':
        data.url = event.url as string;
        data.userAgent = event.useragent as string;
        data.ip = event.ip as string;
        break;

      case 'bounce':
        data.bounceType = event.type as string;
        data.reason = event.reason as string;
        data.status = event.status as string;
        break;

      case 'dropped':
        data.reason = event.reason as string;
        break;

      case 'spamreport':
        data.ip = event.ip as string;
        break;

      default:
        break;
    }

    return data;
  }
}
