import { describe, it, expect } from 'vitest';
import { GenericWebhookSource } from '../../../src/webhooks/sources/generic.js';
import type { WebhookRequest } from '../../../src/webhooks/types.js';
import crypto from 'crypto';

describe('GenericWebhookSource', () => {
  const source = new GenericWebhookSource();

  function createReq(
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
    rawBody?: Buffer
  ): WebhookRequest {
    return {
      body,
      headers,
      rawBody: rawBody ?? Buffer.from(JSON.stringify(body)),
    } as WebhookRequest;
  }

  it('should reject request without signature header', async () => {
    const req = createReq({ event: 'test' });
    await expect(source.validateSignature(req, 'secret')).rejects.toThrow(
      'Missing x-signature header'
    );
  });

  it('should validate HMAC-SHA256 signature', async () => {
    const body = { event: 'test' };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = crypto.createHmac('sha256', 'secret').update(rawBody).digest('hex');
    const req = createReq(body, { 'x-signature': signature }, rawBody);

    const valid = await source.validateSignature(req, 'secret');
    expect(valid).toBe(true);
  });

  it('should validate HMAC-SHA1 signature', async () => {
    const body = { event: 'test' };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = crypto.createHmac('sha1', 'secret').update(rawBody).digest('hex');
    const req = createReq(
      body,
      { 'x-signature': signature, 'x-signature-algorithm': 'sha1' },
      rawBody
    );

    const valid = await source.validateSignature(req, 'secret');
    expect(valid).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const body = { event: 'test' };
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = createReq(body, { 'x-signature': 'a'.repeat(64) }, rawBody);

    const valid = await source.validateSignature(req, 'secret');
    expect(valid).toBe(false);
  });

  it('should normalize payload with event field', async () => {
    const req = createReq({ event: 'user.created', id: 'evt-1' });
    const event = await source.normalizePayload(req);
    expect(event.type).toBe('generic.user.created');
    expect(event.correlationId).toBe('evt-1');
    expect(event.metadata.webhookId).toBe('evt-1');
  });

  it('should normalize payload with type field', async () => {
    const req = createReq({ type: 'order.placed' });
    const event = await source.normalizePayload(req);
    expect(event.type).toBe('generic.order.placed');
  });

  it('should use unknown for missing event/type', async () => {
    const req = createReq({ data: 'value' });
    const event = await source.normalizePayload(req);
    expect(event.type).toBe('generic.unknown');
  });

  it('should get event type', () => {
    expect(source.getEventType(createReq({ event: 'test' }))).toBe('generic.test');
    expect(source.getEventType(createReq({ type: 'test' }))).toBe('generic.test');
    expect(source.getEventType(createReq({}))).toBe('generic.unknown');
  });

  it('should get webhook id', () => {
    expect(source.getWebhookId(createReq({ id: 'evt-1' }))).toBe('evt-1');
    expect(source.getWebhookId(createReq({}))).toBeUndefined();
  });
});
