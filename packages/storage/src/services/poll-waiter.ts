import { logger, matchEventType } from '@reaatech/webhook-relay-core';
import type { StorageService } from '../index.js';
import type { EventEntity } from '../repositories/events.js';

interface PollWaiter {
  subscriptionId: string;
  eventTypes: string[];
  filters: Record<string, unknown> | undefined;
  limit: number;
  resolve: (events: EventEntity[]) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PollWaiterService {
  private static instance: PollWaiterService;
  private waiters = new Map<string, PollWaiter>();

  static getInstance(): PollWaiterService {
    if (!PollWaiterService.instance) {
      PollWaiterService.instance = new PollWaiterService();
    }
    return PollWaiterService.instance;
  }

  register(id: string, waiter: PollWaiter): void {
    this.waiters.set(id, waiter);
  }

  delete(id: string): void {
    this.waiters.delete(id);
  }

  async notify(event: EventEntity, storage: StorageService): Promise<void> {
    for (const waiter of this.waiters.values()) {
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
        waiter.eventTypes,
        waiter.filters,
        waiter.limit,
      );

      if (events.length > 0) {
        await markEventsDelivered(storage, waiter.subscriptionId, events);
        waiter.resolve(events);
      }
    }
  }
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

export function formatEvent(event: EventEntity): Record<string, unknown> {
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
