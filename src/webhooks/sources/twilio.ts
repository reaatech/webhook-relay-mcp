import { ulid } from 'ulid';
import crypto from 'crypto';
import type { WebhookSource, NormalizedWebhookEvent, WebhookRequest } from '../types.js';

interface TwilioWebhookPayload {
  MessageSid?: string;
  CallSid?: string;
  MessageStatus?: string;
  CallStatus?: string;
  From?: string;
  To?: string;
  Body?: string;
  [key: string]: unknown;
}

const SMS_TYPE_MAP: Record<string, string> = {
  delivered: 'sms.delivered',
  failed: 'sms.failed',
  received: 'sms.received',
  sent: 'sms.sent',
  queued: 'sms.queued',
};

const CALL_TYPE_MAP: Record<string, string> = {
  ringing: 'call.ringing',
  'in-progress': 'call.in_progress',
  completed: 'call.completed',
  busy: 'call.busy',
  failed: 'call.failed',
  'no-answer': 'call.no_answer',
  canceled: 'call.canceled',
};

export class TwilioWebhookSource implements WebhookSource {
  readonly name = 'twilio';
  readonly displayName = 'Twilio';

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['x-twilio-signature'] as string;
    if (!signature) {
      throw new Error('Missing X-Twilio-Signature header');
    }

    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = req.body as Record<string, string>;
    const sortedKeys = Object.keys(params).sort();
    const data = url + sortedKeys.map((key) => `${key}${params[key] ?? ''}`).join('');

    const expectedSignature = crypto.createHmac('sha1', secret).update(data).digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const payload = req.body as TwilioWebhookPayload;
    const isMessage = !!payload.MessageSid;
    const sid = payload.MessageSid ?? payload.CallSid ?? 'unknown';
    const status = payload.MessageStatus ?? payload.CallStatus ?? 'unknown';
    const sourceType = isMessage ? `message.${status}` : `call.${status}`;
    const typeMap = isMessage ? SMS_TYPE_MAP : CALL_TYPE_MAP;
    const normalizedType = typeMap[status] ?? `twilio.${sourceType}`;
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp: receivedAt,
      receivedAt,
      correlationId: sid,
      data: {
        sid,
        from: payload.From,
        to: payload.To,
        status,
        body: payload.Body,
        ...payload,
      },
      rawPayload: payload,
      metadata: {
        webhookId: sid,
        messageSid: payload.MessageSid,
        callSid: payload.CallSid,
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const payload = req.body as TwilioWebhookPayload;
    const isMessage = !!payload.MessageSid;
    const status = payload.MessageStatus ?? payload.CallStatus ?? 'unknown';
    const sourceType = isMessage ? `message.${status}` : `call.${status}`;
    const typeMap = isMessage ? SMS_TYPE_MAP : CALL_TYPE_MAP;
    return typeMap[status] ?? `twilio.${sourceType}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    const payload = req.body as TwilioWebhookPayload;
    return payload.MessageSid ?? payload.CallSid;
  }
}
