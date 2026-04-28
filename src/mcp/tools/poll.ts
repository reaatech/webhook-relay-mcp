import crypto from 'crypto';
import { defineTool, type ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import type { EventEntity } from '../../storage/repositories/events.js';
import { logger } from '../../utils/logger.js';
import { matchEventType } from '../../utils/patterns.js';
import { pollSchema } from '../../utils/validation.js';

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

const pollWaiters = new Map<
  string,
  {
    subscriptionId: string;
    eventTypes: string[];
    filters: Record<string, unknown> | undefined;
    limit: number;
    resolve: (events: EventEntity[]) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

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
        subscriptionId,
        filterTypes,
        subscription.filters,
        effectiveLimit
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
                2
              ),
            },
          ],
        };
      }

      return await blockingPoll(
        storage,
        subscriptionId,
        filterTypes,
        subscription.filters,
        effectiveTimeout,
        effectiveLimit
      );
    } catch (error) {
      logger.error({ error, event: 'poll_error', subscriptionId }, 'Poll failed');
      throw new Error(`Poll failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

async function getMatchingEvents(
  storage: StorageService,
  _subscriptionId: string,
  eventTypes: string[],
  filters: Record<string, unknown> | undefined,
  limit: number
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
  for (const [key, value] of Object.entries(filters)) {
    const eventValue = event.data[key] ?? event[key as keyof EventEntity];
    if (eventValue !== value) {
      return false;
    }
  }
  return true;
}

async function markEventsDelivered(
  storage: StorageService,
  subscriptionId: string,
  events: EventEntity[]
): Promise<void> {
  const eventIds = events.map((e) => e.id);
  await storage.subscriptions.markDelivered(subscriptionId, eventIds);
  for (const event of events) {
    logger.info({ subscriptionId, eventId: event.id }, 'Event marked delivered');
  }
}

async function blockingPoll(
  storage: StorageService,
  subscriptionId: string,
  eventTypes: string[],
  filters: Record<string, unknown> | undefined,
  timeout: number,
  limit: number
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const waiterId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pollWaiters.delete(waiterId);
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
              2
            ),
          },
        ],
      });
    }, timeout);

    pollWaiters.set(waiterId, {
      subscriptionId,
      eventTypes,
      filters,
      limit,
      resolve: (events: EventEntity[]) => {
        clearTimeout(timeoutId);
        pollWaiters.delete(waiterId);
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
                2
              ),
            },
          ],
        });
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        pollWaiters.delete(waiterId);
        reject(error);
      },
      timeout: timeoutId,
    });
  });
}

export async function notifyPollWaiters(
  event: EventEntity,
  storage: StorageService
): Promise<void> {
  for (const waiter of pollWaiters.values()) {
    const typeMatch = waiter.eventTypes.some((pattern) => matchEventType(pattern, event.type));
    if (!typeMatch) {
      continue;
    }

    if (waiter.filters && Object.keys(waiter.filters).length > 0) {
      if (!matchesFilters(event, waiter.filters)) {
        continue;
      }
    }

    const events = await getMatchingEvents(
      storage,
      waiter.subscriptionId,
      waiter.eventTypes,
      waiter.filters,
      waiter.limit
    );

    if (events.length > 0) {
      await markEventsDelivered(storage, waiter.subscriptionId, events);
      waiter.resolve(events);
    }
  }
}

function formatEvent(event: EventEntity): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    sourceType: event.sourceType,
    timestamp: event.timestamp,
    correlationId: event.correlationId,
    data: event.data,
  };
}
