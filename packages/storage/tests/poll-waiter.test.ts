import {
  DatabaseService,
  formatEvent,
  PollWaiterService,
  StorageService,
} from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PollWaiterService', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM subscriptions').run();
  });

  it('should be a singleton', () => {
    const a = PollWaiterService.getInstance();
    const b = PollWaiterService.getInstance();
    expect(a).toBe(b);
  });

  it('should register and delete waiters', () => {
    const svc = PollWaiterService.getInstance();
    const waiter = {
      subscriptionId: 'sub-1',
      eventTypes: ['test.*'],
      filters: undefined,
      limit: 10,
      resolve: vi.fn(),
      reject: vi.fn(),
      timeout: setTimeout(() => {}, 10000),
    };

    svc.register('w-1', waiter);
    svc.delete('w-1');
    clearTimeout(waiter.timeout);
  });

  it('should notify matching waiter and resolve with events', async () => {
    const storage = StorageService.getInstance();

    // Create a matching event in the database
    const event = await storage.events.create({
      type: 'test.event',
      source: 'test',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: { foo: 'bar' },
      rawPayload: { id: 'x' },
      processed: false,
    });

    // Create a subscription so markDelivered doesn't fail
    const sub = await storage.subscriptions.create({
      eventTypes: ['test.event'],
      isActive: true,
    });

    const resolveFn = vi.fn();
    const rejectFn = vi.fn();
    const timeout = setTimeout(() => {}, 10000);

    const waiter = {
      subscriptionId: sub.id,
      eventTypes: ['test.event'],
      filters: undefined,
      limit: 10,
      resolve: resolveFn,
      reject: rejectFn,
      timeout,
    };

    const svc = PollWaiterService.getInstance();
    svc.register('w-2', waiter);

    await svc.notify(event, storage);

    expect(resolveFn).toHaveBeenCalledTimes(1);
    expect(resolveFn).toHaveBeenCalledWith([expect.objectContaining({ id: event.id })]);

    clearTimeout(timeout);
  });

  it('should skip waiter with non-matching event type', async () => {
    const storage = StorageService.getInstance();
    const event = await storage.events.create({
      type: 'other.event',
      source: 'test',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });

    const resolveFn = vi.fn();
    const timeout = setTimeout(() => {}, 10000);

    const waiter = {
      subscriptionId: 'sub-x',
      eventTypes: ['test.*'],
      filters: undefined,
      limit: 10,
      resolve: resolveFn,
      reject: vi.fn(),
      timeout,
    };

    const svc = PollWaiterService.getInstance();
    svc.register('w-3', waiter);

    await svc.notify(event, storage);

    expect(resolveFn).not.toHaveBeenCalled();
    clearTimeout(timeout);
  });

  it('formatEvent converts event to expected shape', () => {
    const event = {
      id: 'evt-1',
      type: 'test.event',
      source: 'github',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: '2024-01-01T00:00:00Z',
      receivedAt: '2024-01-01T00:00:00Z',
      correlationId: 'corr-123',
      data: { action: 'push' },
      rawPayload: {},
      metadata: {},
      processed: false,
      createdAt: '2024-01-01T00:00:00Z',
    };

    const result = formatEvent(event);
    expect(result).toEqual({
      id: 'evt-1',
      type: 'test.event',
      source: 'github',
      sourceType: 'generic',
      timestamp: '2024-01-01T00:00:00Z',
      correlationId: 'corr-123',
      data: { action: 'push' },
    });
  });
});
