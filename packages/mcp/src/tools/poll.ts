import crypto from 'node:crypto';
import { evaluateFilter, logger, pollSchema } from '@reaatech/webhook-relay-core';
import type { EventEntity } from '@reaatech/webhook-relay-storage';
import { formatEvent, PollWaiterService, StorageService } from '@reaatech/webhook-relay-storage';
import { defineTool, type ToolInputSchema } from '../types.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    subscriptionId: {
      type: 'string',
      description: 'Subscription ID to poll from',
    },
    eventTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Event type patterns to filter (overrides subscription filters)',
    },
    timeout: {
      type: 'number',
      description: 'Maximum time to wait for events in seconds (default: 30, max: 120)',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of events to return (default: 10, max: 100)',
    },
  },
  required: ['subscriptionId'],
};

export const pollTool = defineTool(
  'webhooks.poll',
  'Poll for events matching subscription criteria. Supports blocking with timeout.',
  inputSchema,
  async (args) => {
    const parsed = pollSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Invalid poll parameters');
    }

    const { subscriptionId, eventTypes, timeout = 30, limit = 10 } = parsed.data;

    const effectiveTimeout = Math.min(timeout, 120) * 1000;
    const effectiveLimit = Math.min(limit, 100);

    try {
      const storage = StorageService.getInstance();

      const subscription = await storage.subscriptions.findById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      if (!subscription.isActive) {
        throw new Error(`Subscription ${subscriptionId} is not active`);
      }

      if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
        throw new Error(`Subscription ${subscriptionId} has expired`);
      }

      const filterTypes =
        Array.isArray(eventTypes) && eventTypes.length > 0
          ? (eventTypes as string[])
          : subscription.eventTypes;

      const existingEvents = await getMatchingEvents(
        storage,
        filterTypes,
        subscription.filters,
        effectiveLimit,
      );

      if (existingEvents.length > 0) {
        await markEventsDelivered(storage, subscriptionId, existingEvents);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  events: existingEvents.map((e) => formatEvent(e)),
                  hasMore: existingEvents.length === effectiveLimit,
                  waited: false,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return await blockingPoll(
        subscriptionId,
        filterTypes,
        subscription.filters,
        effectiveTimeout,
        effectiveLimit,
      );
    } catch (error) {
      logger.error({ error, event: 'poll_error', subscriptionId }, 'Poll failed');
      throw new Error(`Poll failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        cause: error,
      });
    }
  },
);

async function getMatchingEvents(
  storage: StorageService,
  eventTypes: string[],
  filters: Record<string, unknown> | undefined,
  limit: number,
): Promise<EventEntity[]> {
  const events = await storage.events.list({
    types: eventTypes,
    limit,
    orderBy: 'timestamp',
    order: 'DESC',
  });

  if (filters && Object.keys(filters).length > 0) {
    return events.filter((event) => matchesFilters(event, filters));
  }

  return events;
}

function matchesFilters(event: EventEntity, filters: Record<string, unknown>): boolean {
  return evaluateFilter(filters, event as unknown as Record<string, unknown>);
}

async function markEventsDelivered(
  storage: StorageService,
  subscriptionId: string,
  events: EventEntity[],
): Promise<void> {
  const eventIds = events.map((e) => e.id);
  await storage.subscriptions.markDelivered(subscriptionId, eventIds);
  for (const event of events) {
    logger.info({ subscriptionId, eventId: event.id }, 'Event marked delivered');
  }
}

async function blockingPoll(
  subscriptionId: string,
  eventTypes: string[],
  filters: Record<string, unknown> | undefined,
  timeout: number,
  limit: number,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const waiterId = crypto.randomUUID();
  const waiterService = PollWaiterService.getInstance();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      waiterService.delete(waiterId);
      resolve({
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                events: [],
                hasMore: false,
                waited: true,
                timedOut: true,
              },
              null,
              2,
            ),
          },
        ],
      });
    }, timeout);

    waiterService.register(waiterId, {
      subscriptionId,
      eventTypes,
      filters,
      limit,
      resolve: (events: EventEntity[]) => {
        clearTimeout(timeoutId);
        waiterService.delete(waiterId);
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  events: events.map((e) => formatEvent(e)),
                  hasMore: events.length === limit,
                  waited: true,
                  timedOut: false,
                },
                null,
                2,
              ),
            },
          ],
        });
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        waiterService.delete(waiterId);
        reject(error);
      },
      timeout: timeoutId,
    });
  });
}
