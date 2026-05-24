import crypto from 'node:crypto';
import { StripeWebhookSource } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';
import paymentFailedFixture from '../../fixtures/stripe/payment-failed.json' with { type: 'json' };
import paymentSucceededFixture from '../../fixtures/stripe/payment-succeeded.json' with {
  type: 'json',
};

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
        'Missing Stripe-Signature header',
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

  describe('getEventType', () => {
    it('should return mapped type for known event', () => {
      const req = createMockRequest(paymentSucceededFixture);
      expect(source.getEventType(req)).toBe('payment.completed');
    });

    it('should return stripe. prefix for unmapped events', () => {
      const req = createMockRequest({
        id: 'evt_custom',
        type: 'custom.unknown',
        created: 1700000000,
        data: { object: { id: 'obj_1' } },
      });
      expect(source.getEventType(req)).toBe('stripe.custom.unknown');
    });
  });

  describe('getWebhookId', () => {
    it('should return the event id', () => {
      const req = createMockRequest(paymentSucceededFixture);
      expect(source.getWebhookId(req)).toBe('evt_test_123');
    });
  });

  describe('normalizePayload - additional event types', () => {
    it('should normalize payment_intent.succeeded', async () => {
      const body = {
        id: 'evt_pi',
        type: 'payment_intent.succeeded',
        created: 1700000000,
        data: { object: { id: 'pi_1', customer: 'cus_1', amount: 2000, currency: 'usd' } },
      };
      const req = createMockRequest(body);
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('payment.completed');
      expect(event.data.paymentIntentId).toBe('pi_1');
      expect(event.data.amount).toBe(2000);
    });

    it('should normalize customer.subscription.created', async () => {
      const body = {
        id: 'evt_sub',
        type: 'customer.subscription.created',
        created: 1700000000,
        data: {
          object: { id: 'sub_1', customer: 'cus_1', status: 'active', plan: { id: 'plan_1' } },
        },
      };
      const req = createMockRequest(body);
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('subscription.created');
      expect(event.data.subscriptionId).toBe('sub_1');
      expect(event.data.planId).toBe('plan_1');
    });

    it('should normalize checkout.session.completed', async () => {
      const body = {
        id: 'evt_cs',
        type: 'checkout.session.completed',
        created: 1700000000,
        data: {
          object: {
            id: 'cs_1',
            customer: 'cus_1',
            amount_total: 3000,
            currency: 'usd',
            payment_status: 'paid',
          },
        },
      };
      const req = createMockRequest(body);
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('checkout.completed');
      expect(event.data.sessionId).toBe('cs_1');
      expect(event.data.paymentStatus).toBe('paid');
    });

    it('should normalize charge.refunded', async () => {
      const body = {
        id: 'evt_ref',
        type: 'charge.refunded',
        created: 1700000000,
        data: { object: { id: 'ch_1' } },
      };
      const req = createMockRequest(body);
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('refund.created');
    });

    it('should fallback to default event type for unmapped types', async () => {
      const body = {
        id: 'evt_other',
        type: 'radar.early_fraud_warning',
        created: 1700000000,
        data: { object: { id: 'fw_1' } },
      };
      const req = createMockRequest(body);
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('stripe.radar.early_fraud_warning');
    });

    it('should set metadata with attempt number from header', async () => {
      const body = {
        id: 'evt_meta',
        type: 'payment_intent.succeeded',
        created: 1700000000,
        data: { object: { id: 'pi_2', customer: 'cus_2', amount: 500, currency: 'usd' } },
      };
      const req = createMockRequest(body);
      req.headers['stripe-notification-attempt'] = '3';
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.metadata.attemptNumber).toBe(3);
    });
  });
});
