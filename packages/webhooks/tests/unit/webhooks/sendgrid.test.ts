import crypto from 'node:crypto';
import { SendGridWebhookSource } from '@reaatech/webhook-relay-webhooks';
import type { WebhookRequest } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';

describe('SendGridWebhookSource', () => {
  const source = new SendGridWebhookSource();
  const secret = 'sendgrid_test_secret';

  function createReq(
    body: unknown,
    headers: Record<string, string> = {},
    rawBody?: Buffer,
  ): WebhookRequest {
    return {
      body,
      headers,
      rawBody: rawBody ?? Buffer.from(JSON.stringify(body)),
    } as WebhookRequest;
  }

  describe('validateSignature', () => {
    it('should throw when signature header is missing', async () => {
      const req = createReq({});
      await expect(source.validateSignature(req, secret)).rejects.toThrow(
        'Missing X-SendGrid-Signature header',
      );
    });

    it('should validate a correct HMAC signature', async () => {
      const body = { event: 'delivered', email: 'test@example.com' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const req = createReq(body, { 'x-sendgrid-signature': signature }, rawBody);
      const result = await source.validateSignature(req, secret);
      expect(result).toBe(true);
    });

    it('should reject an invalid signature', async () => {
      const body = { event: 'delivered' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const req = createReq(body, { 'x-sendgrid-signature': 'a'.repeat(64) }, rawBody);

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(false);
    });
  });

  describe('normalizePayload', () => {
    it('should normalize a delivered event', async () => {
      const body = {
        sg_event_id: 'evt_delivered_1',
        sg_message_id: 'msg_1',
        event: 'delivered',
        email: 'user@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        response: '250 OK',
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('email.delivered');
      expect(event.source).toBe('sendgrid');
      expect(event.sourceType).toBe('delivered');
      expect(event.data.email).toBe('user@example.com');
      expect(event.data.response).toBe('250 OK');
      expect(event.metadata.webhookId).toBe('evt_delivered_1');
    });

    it('should normalize an open event', async () => {
      const body = {
        sg_event_id: 'evt_open_1',
        event: 'open',
        email: 'user@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        useragent: 'Mozilla/5.0',
        ip: '203.0.113.1',
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('email.opened');
      expect(event.data.userAgent).toBe('Mozilla/5.0');
      expect(event.data.ip).toBe('203.0.113.1');
    });

    it('should normalize a bounce event', async () => {
      const body = {
        event: 'bounce',
        email: 'bounce@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        type: 'hard',
        reason: 'invalid mailbox',
        status: '5.1.1',
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('email.bounced');
      expect(event.data.bounceType).toBe('hard');
      expect(event.data.reason).toBe('invalid mailbox');
      expect(event.data.status).toBe('5.1.1');
    });

    it('should normalize a click event', async () => {
      const body = {
        event: 'click',
        email: 'user@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        url: 'https://example.com/link',
        useragent: 'Mozilla/5.0',
        ip: '203.0.113.1',
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('email.clicked');
      expect(event.data.url).toBe('https://example.com/link');
    });

    it('should normalize a spam report event', async () => {
      const body = {
        event: 'spamreport',
        email: 'user@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        ip: '203.0.113.1',
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('email.spam_reported');
      expect(event.data.ip).toBe('203.0.113.1');
    });

    it('should normalize a dropped event', async () => {
      const body = {
        event: 'dropped',
        email: 'user@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        reason: 'Invalid SMTPAPI header',
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('email.dropped');
      expect(event.data.reason).toBe('Invalid SMTPAPI header');
    });

    it('should handle batch events (array payload)', async () => {
      const body = [
        { sg_event_id: 'evt_1', event: 'delivered', email: 'a@example.com', timestamp: 1700000000 },
        { sg_event_id: 'evt_2', event: 'open', email: 'b@example.com', timestamp: 1700000001 },
      ];
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.metadata.eventCount).toBe(2);
      expect(event.metadata.eventTypes).toEqual(['delivered', 'open']);
    });

    it('should use email. prefix for unmapped events', async () => {
      const body = {
        event: 'unknown_event',
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('email.unknown_event');
    });

    it('should throw on empty payload', async () => {
      const req = createReq([]);
      await expect(source.normalizePayload(req)).rejects.toThrow('Empty SendGrid event payload');
    });
  });

  describe('getWebhookId', () => {
    it('should return sg_event_id from payload', () => {
      const req = createReq({
        sg_event_id: 'evt_123',
        sg_message_id: 'msg_456',
        event: 'delivered',
        email: 'test@example.com',
        timestamp: 1700000000,
      });
      expect(source.getWebhookId(req)).toBe('evt_123');
    });

    it('should fall back to sg_message_id', () => {
      const req = createReq({
        sg_message_id: 'msg_456',
        event: 'delivered',
        email: 'test@example.com',
        timestamp: 1700000000,
      });
      expect(source.getWebhookId(req)).toBe('msg_456');
    });
  });

  describe('getEventType', () => {
    it('should map standard event types', () => {
      expect(source.getEventType(createReq({ event: 'delivered' }))).toBe('email.delivered');
      expect(source.getEventType(createReq({ event: 'open' }))).toBe('email.opened');
      expect(source.getEventType(createReq({ event: 'bounce' }))).toBe('email.bounced');
      expect(source.getEventType(createReq({ event: 'click' }))).toBe('email.clicked');
      expect(source.getEventType(createReq({ event: 'dropped' }))).toBe('email.dropped');
      expect(source.getEventType(createReq({ event: 'spamreport' }))).toBe('email.spam_reported');
      expect(source.getEventType(createReq({ event: 'unsubscribe' }))).toBe('email.unsubscribed');
    });

    it('should use email. prefix for unknown events', () => {
      expect(source.getEventType(createReq({ event: 'custom' }))).toBe('email.custom');
    });

    it('should handle missing event field', () => {
      expect(source.getEventType(createReq({}))).toBe('email.unknown');
    });
  });
});
