import { logger, subscribeSchema } from '@reaatech/webhook-relay-core';
import { StorageService } from '@reaatech/webhook-relay-storage';
import { defineTool, type ToolInputSchema } from '../types.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    eventTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Event type patterns to subscribe to (supports wildcards like "payment.*")',
    },
    filters: {
      type: 'object',
      description:
        'Filter DSL supporting operators: $eq, $neq, $gt, $gte, $lt, $lte, $in, $nin, $regex, $exists, $and, $or, $not. Supports dot-notation for nested fields (e.g., {"$gt": {"data.amount": 5000}}). Simple key-value filters also supported (e.g., {"source": "stripe"}).',
    },
    ttl: {
      type: 'number',
      description: 'Subscription TTL in seconds (default: 3600, max: 86400)',
    },
  },
  required: ['eventTypes'],
};

export const subscribeTool = defineTool(
  'webhooks.subscribe',
  'Subscribe to webhook events matching specified criteria. Returns a subscription ID for polling.',
  inputSchema,
  async (args) => {
    const parsed = subscribeSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Invalid subscription parameters');
    }

    const { eventTypes, filters, ttl = 3600 } = parsed.data;

    const effectiveTtl = Math.min(ttl, 86400);
    const expiresAt = new Date(Date.now() + effectiveTtl * 1000).toISOString();

    try {
      const storage = StorageService.getInstance();
      const subscription = await storage.subscriptions.create({
        eventTypes: eventTypes as string[],
        ...(filters ? { filters: filters as Record<string, unknown> } : {}),
        isActive: true,
        expiresAt,
      });

      logger.info(
        {
          event: 'subscription_created',
          subscriptionId: subscription.id,
          eventTypes,
          expiresAt,
        },
        'Subscription created',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                subscriptionId: subscription.id,
                eventTypes: subscription.eventTypes,
                expiresAt: subscription.expiresAt,
                message: `Subscribed to ${eventTypes.length} event type(s). Use webhooks.poll with this subscriptionId to receive events.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'subscription_error' }, 'Failed to create subscription');
      throw new Error(
        `Failed to create subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
