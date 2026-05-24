import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { statsTool } from '@reaatech/webhook-relay-tools';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.stats tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
  });

  it('should return stats grouped by type', async () => {
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

    const result = await statsTool.execute({ groupBy: 'type' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.groupBy).toBe('type');
    expect(parsed.total).toBe(3);
    expect(parsed.stats).toHaveLength(2);
    const paymentStat = parsed.stats.find(
      (s: { group: string }) => s.group === 'payment.completed',
    );
    expect(paymentStat.count).toBe(2);
  });

  it('should return stats grouped by source', async () => {
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

    const result = await statsTool.execute({ groupBy: 'source' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.groupBy).toBe('source');
    expect(parsed.stats).toHaveLength(2);
  });

  it('should return stats grouped by hour', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'test.event',
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

    const result = await statsTool.execute({ groupBy: 'hour' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.groupBy).toBe('hour');
    expect(parsed.stats).toHaveLength(1);
    expect(parsed.total).toBe(1);
  });

  it('should return stats grouped by day', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'test.event',
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

    const result = await statsTool.execute({ groupBy: 'day' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.groupBy).toBe('day');
    expect(parsed.total).toBe(1);
  });

  it('should filter stats by eventTypes', async () => {
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

    const result = await statsTool.execute({
      groupBy: 'type',
      eventTypes: ['payment.completed'],
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.total).toBe(1);
  });

  it('should filter stats by sources', async () => {
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

    const result = await statsTool.execute({
      groupBy: 'type',
      sources: ['stripe'],
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.total).toBe(1);
  });

  it('should filter stats by time range', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'test.event',
      source: 'test',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });
    await storage.events.create({
      type: 'test.event',
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

    const result = await statsTool.execute({
      groupBy: 'type',
      startTime: new Date(Date.now() - 3600000).toISOString(),
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.total).toBe(1);
  });

  it('should return empty stats when no events exist', async () => {
    const result = await statsTool.execute({ groupBy: 'type' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.stats).toEqual([]);
    expect(parsed.total).toBe(0);
  });

  it('should filter stats by endTime', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'test.event',
      source: 'test',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });
    await storage.events.create({
      type: 'test.event',
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

    const result = await statsTool.execute({
      groupBy: 'type',
      endTime: new Date(Date.now() - 3600000).toISOString(),
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.total).toBe(1);
  });

  it('should reject invalid groupBy', async () => {
    await expect(statsTool.execute({ groupBy: 'invalid' })).rejects.toThrow(
      'groupBy must be one of',
    );
  });
});
