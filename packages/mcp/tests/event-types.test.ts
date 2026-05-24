import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { eventTypesTool } from '@reaatech/webhook-relay-tools';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.event-types tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
  });

  it('should list all event types', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'payment.completed',
      source: 'stripe',
      sourceType: 'stripe',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });
    await storage.events.create({
      type: 'code.push',
      source: 'github',
      sourceType: 'github',
      sourceId: 'src-2',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });

    const result = await eventTypesTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.totalTypes).toBe(2);
    expect(parsed.totalEvents).toBe(2);
    expect(parsed.eventTypes).toHaveLength(2);
  });

  it('should filter event types by source', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'payment.completed',
      source: 'stripe',
      sourceType: 'stripe',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });
    await storage.events.create({
      type: 'code.push',
      source: 'github',
      sourceType: 'github',
      sourceId: 'src-2',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });

    const result = await eventTypesTool.execute({ source: 'stripe' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.totalTypes).toBe(1);
    expect(parsed.eventTypes[0]?.source).toBe('stripe');
  });

  it('should include count and lastSeen for each event type', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'payment.completed',
      source: 'stripe',
      sourceType: 'stripe',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });

    const result = await eventTypesTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    const entry = parsed.eventTypes[0];
    expect(entry).toHaveProperty('type');
    expect(entry).toHaveProperty('source');
    expect(entry).toHaveProperty('sourceType');
    expect(entry).toHaveProperty('count');
    expect(entry).toHaveProperty('lastSeen');
    expect(entry.count).toBe(1);
  });

  it('should return empty list when no events exist', async () => {
    const result = await eventTypesTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.eventTypes).toEqual([]);
    expect(parsed.totalTypes).toBe(0);
    expect(parsed.totalEvents).toBe(0);
  });
});
