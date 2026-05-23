import { ulid } from 'ulid';
import type { WebhookSource, NormalizedWebhookEvent, WebhookRequest } from '../types.js';
import { StripeSignatureValidator } from '../validators/base.js';

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
  api_version?: string;
}

const STRIPE_TYPE_MAP: Record<string, string> = {
  'invoice.payment_succeeded': 'payment.completed',
  'invoice.payment_failed': 'payment.failed',
  'payment_intent.succeeded': 'payment.completed',
  'payment_intent.payment_failed': 'payment.failed',
  'charge.succeeded': 'payment.completed',
  'charge.failed': 'payment.failed',
  'customer.subscription.created': 'subscription.created',
  'customer.subscription.updated': 'subscription.updated',
  'customer.subscription.deleted': 'subscription.deleted',
  'customer.subscription.paused': 'subscription.paused',
  'customer.subscription.resumed': 'subscription.resumed',
  'customer.created': 'customer.created',
  'customer.updated': 'customer.updated',
  'customer.deleted': 'customer.deleted',
  'checkout.session.completed': 'checkout.completed',
  'checkout.session.async_payment_succeeded': 'payment.completed',
  'checkout.session.async_payment_failed': 'payment.failed',
  'charge.refunded': 'refund.created',
  'charge.refund.updated': 'refund.updated',
};

export class StripeWebhookSource implements WebhookSource {
  readonly name = 'stripe';
  readonly displayName = 'Stripe';
  private readonly validator = new StripeSignatureValidator();

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      throw new Error('Missing Stripe-Signature header');
    }
    return this.validator.validate(req.rawBody as Buffer, signature, secret);
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const stripeEvent = req.body as StripeEvent;
    const sourceType = stripeEvent.type;
    const normalizedType = STRIPE_TYPE_MAP[sourceType] ?? `stripe.${sourceType}`;
    const timestamp = new Date(stripeEvent.created * 1000).toISOString();
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: this.extractCorrelationId(stripeEvent),
      data: this.extractEventData(stripeEvent),
      rawPayload: stripeEvent,
      metadata: {
        webhookId: stripeEvent.id,
        apiVersion: stripeEvent.api_version,
        attemptNumber: req.headers['stripe-notification-attempt']
          ? parseInt(req.headers['stripe-notification-attempt'] as string, 10)
          : 1,
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const stripeEvent = req.body as StripeEvent;
    return STRIPE_TYPE_MAP[stripeEvent.type] ?? `stripe.${stripeEvent.type}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    const stripeEvent = req.body as StripeEvent;
    return stripeEvent.id;
  }

  private extractEventData(event: StripeEvent): Record<string, unknown> {
    const object = event.data.object;
    const baseData: Record<string, unknown> = {
      stripeEventId: event.id,
      stripeEventType: event.type,
    };

    switch (event.type) {
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        baseData.customerId = object.customer as string;
        baseData.amount = (object as { amount_due?: number }).amount_due;
        baseData.currency = (object as { currency?: string }).currency;
        baseData.invoiceId = object.id as string;
        break;

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        baseData.customerId = (object as { customer?: string }).customer;
        baseData.amount = (object as { amount?: number }).amount;
        baseData.currency = (object as { currency?: string }).currency;
        baseData.paymentIntentId = object.id as string;
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        baseData.customerId = (object as { customer?: string }).customer;
        baseData.subscriptionId = object.id as string;
        baseData.status = (object as { status?: string }).status;
        baseData.planId = (object as { plan?: { id?: string } }).plan?.id;
        break;

      case 'checkout.session.completed':
        baseData.customerId = (object as { customer?: string }).customer;
        baseData.sessionId = object.id as string;
        baseData.amountTotal = (object as { amount_total?: number }).amount_total;
        baseData.currency = (object as { currency?: string }).currency;
        baseData.paymentStatus = (object as { payment_status?: string }).payment_status;
        break;

      default:
        baseData.object = object;
    }

    return baseData;
  }

  private extractCorrelationId(event: StripeEvent): string | undefined {
    const object = event.data.object as { id?: string };
    return object.id;
  }
}
