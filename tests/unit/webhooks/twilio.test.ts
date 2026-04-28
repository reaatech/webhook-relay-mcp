import { describe, it, expect } from 'vitest';
import { TwilioWebhookSource } from '../../../src/webhooks/sources/twilio.js';
import type { WebhookRequest } from '../../../src/webhooks/types.js';
import crypto from 'crypto';

describe('TwilioWebhookSource', () => {
  const source = new TwilioWebhookSource();

  function createReq(
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ): WebhookRequest {
    return {
      body,
      headers,
      protocol: 'https',
      get: (name: string) => (name === 'host' ? 'example.com' : ''),
      originalUrl: '/webhooks/twilio',
    } as unknown as WebhookRequest;
  }

  it('should throw on missing signature header', async () => {
    const req = createReq({});
    await expect(source.validateSignature(req, 'secret')).rejects.toThrow(
      'Missing X-Twilio-Signature'
    );
  });

  it('should validate correct signature', async () => {
    const body: Record<string, string> = { MessageSid: 'msg-1', MessageStatus: 'delivered' };
    const url = 'https://example.com/webhooks/twilio';
    const sortedKeys = Object.keys(body).sort();
    const data = url + sortedKeys.map((k) => `${k}${body[k] ?? ''}`).join('');
    const signature = crypto.createHmac('sha1', 'secret').update(data).digest('base64');

    const req = createReq(body, { 'x-twilio-signature': signature });
    const valid = await source.validateSignature(req, 'secret');
    expect(valid).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const req = createReq(
      { MessageSid: 'msg-1' },
      { 'x-twilio-signature': crypto.randomBytes(20).toString('base64') }
    );
    const valid = await source.validateSignature(req, 'secret');
    expect(valid).toBe(false);
  });

  it('should normalize SMS payload', async () => {
    const req = createReq({
      MessageSid: 'msg-1',
      MessageStatus: 'delivered',
      From: '+1234',
      To: '+5678',
      Body: 'Hello',
    });
    const event = await source.normalizePayload(req);
    expect(event.type).toBe('sms.delivered');
    expect(event.correlationId).toBe('msg-1');
    expect(event.data.from).toBe('+1234');
  });

  it('should normalize call payload', async () => {
    const req = createReq({
      CallSid: 'call-1',
      CallStatus: 'completed',
      From: '+1234',
      To: '+5678',
    });
    const event = await source.normalizePayload(req);
    expect(event.type).toBe('call.completed');
    expect(event.correlationId).toBe('call-1');
  });

  it('should handle unknown status', async () => {
    const req = createReq({ MessageSid: 'msg-1', MessageStatus: 'weird' });
    const event = await source.normalizePayload(req);
    expect(event.type).toBe('twilio.message.weird');
  });

  it('should get event type for SMS', () => {
    const req = createReq({ MessageSid: 'msg-1', MessageStatus: 'failed' });
    expect(source.getEventType(req)).toBe('sms.failed');
  });

  it('should get event type for call', () => {
    const req = createReq({ CallSid: 'call-1', CallStatus: 'busy' });
    expect(source.getEventType(req)).toBe('call.busy');
  });

  it('should get webhook id', () => {
    expect(source.getWebhookId(createReq({ MessageSid: 'msg-1' }))).toBe('msg-1');
    expect(source.getWebhookId(createReq({ CallSid: 'call-1' }))).toBe('call-1');
    expect(source.getWebhookId(createReq({}))).toBeUndefined();
  });
});
