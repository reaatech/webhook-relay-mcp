import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { StripeWebhookSource } from '../../../src/webhooks/sources/stripe.js';
import paymentSucceededFixture from '../../fixtures/stripe/payment-succeeded.json' with { type: 'json' };
import paymentFailedFixture from '../../fixtures/stripe/payment-failed.json' with { type: 'json' };

describe('StripeWebhookSource', () => {
  const source = new StripeWebhookSource();
  const secret = 'whsec_test_secret';

  function createMockRequest(body: unknown, signature?: string) {
    const rawBody = Buffer.from(JSON.stringify(body));
    return {
      body,
      rawBody,
      headers: {
        'stripe-signature': signature,
      },
    } as unknown as Parameters<typeof source.validateSignature>[0];
  }

  describe('validateSignature', () => {
    it('should validate a correct signature', async () => {
      const body = { id: 'evt_123', type: 'test' };
      const timestamp = Math.floor(Date.now() / 1000);
      const rawBody = Buffer.from(JSON.stringify(body));
      const signedPayload = `${timestamp}.${rawBody.toString()}`;
      const sig = `t=${timestamp},v1=${crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')}`;

      const req = createMockRequest(body, sig);
      req.rawBody = rawBody;

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(true);
    });

    it('should reject a signature with wrong secret', async () => {
      const body = { id: 'evt_123', type: 'test' };
      const timestamp = Math.floor(Date.now() / 1000);
      const rawBody = Buffer.from(JSON.stringify(body));
      const signedPayload = `${timestamp}.${rawBody.toString()}`;
      const sig = `t=${timestamp},v1=${crypto.createHmac('sha256', 'wrong_secret').update(signedPayload).digest('hex')}`;

      const req = createMockRequest(body, sig);
      req.rawBody = rawBody;

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(false);
    });

    it('should throw when signature header is missing', async () => {
      const req = createMockRequest({});
      await expect(source.validateSignature(req, secret)).rejects.toThrow(
        'Missing Stripe-Signature header'
      );
    });
  });

  describe('normalizePayload', () => {
    it('should normalize invoice.payment_succeeded', async () => {
      const req = createMockRequest(paymentSucceededFixture, 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(paymentSucceededFixture));

      const event = await source.normalizePayload(req);
      expect(event.type).toBe('payment.completed');
      expect(event.source).toBe('stripe');
      expect(event.sourceType).toBe('invoice.payment_succeeded');
      expect(event.data.customerId).toBe('cus_test_123');
      expect(event.data.amount).toBe(5000);
      expect(event.data.currency).toBe('usd');
    });

    it('should normalize invoice.payment_failed', async () => {
      const req = createMockRequest(paymentFailedFixture, 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(paymentFailedFixture));

      const event = await source.normalizePayload(req);
      expect(event.type).toBe('payment.failed');
      expect(event.data.amount).toBe(10000);
    });

    it('should use stripe. prefix for unmapped events', async () => {
      const body = {
        id: 'evt_custom',
        type: 'custom.unknown',
        created: 1700000000,
        data: { object: { id: 'obj_1' } },
      };
      const req = createMockRequest(body, 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));

      const event = await source.normalizePayload(req);
      expect(event.type).toBe('stripe.custom.unknown');
    });
  });

  describe('getWebhookId', () => {
    it('should return the event id', () => {
      const req = createMockRequest(paymentSucceededFixture);
      expect(source.getWebhookId(req)).toBe('evt_test_123');
    });
  });
});
