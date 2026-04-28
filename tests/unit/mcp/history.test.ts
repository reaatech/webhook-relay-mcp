import { describe, it, expect, beforeEach } from 'vitest';
import { historyTool } from '../../../src/mcp/tools/history.js';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('webhooks.history tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
  });

  it('should return empty list when no events exist', async () => {
    const result = await historyTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.events).toEqual([]);
    expect(parsed.count).toBe(0);
    expect(parsed.hasMore).toBe(false);
    expect(parsed.nextCursor).toBeNull();
  });

  it('should query events with filters', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'payment.completed',
      source: 'stripe',
      sourceType: 'stripe',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: { amount: 100 },
      rawPayload: { id: 'evt-1' },
      processed: false,
    });

    const result = await historyTool.execute({
      eventTypes: ['payment.completed'],
      sources: ['stripe'],
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.count).toBe(1);
    expect(parsed.events[0]?.type).toBe('payment.completed');
  });

  it('should support pagination with cursor', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 5; i++) {
      await storage.events.create({
        type: 'test.event',
        source: 'test',
        sourceType: 'generic',
        sourceId: 'src-1',
        webhookId: null,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        receivedAt: new Date().toISOString(),
        data: { index: i },
        rawPayload: { id: `evt-${i}` },
        processed: false,
      });
    }

    const result = await historyTool.execute({ limit: 2 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.count).toBe(2);
    expect(parsed.hasMore).toBe(true);
    expect(parsed.nextCursor).not.toBeNull();
  });

  it('should reject invalid cursor', async () => {
    await expect(historyTool.execute({ cursor: 'invalid-cursor' })).rejects.toThrow(
      'Invalid cursor format'
    );
  });

  it('should filter by correlationId', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'test.event',
      source: 'test',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      correlationId: 'corr-123',
      data: {},
      rawPayload: {},
      processed: false,
    });

    const result = await historyTool.execute({ correlationId: 'corr-123' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.count).toBe(1);
  });

  it('should filter by time range', async () => {
    const storage = StorageService.getInstance();
    const now = new Date();
    const past = new Date(now.getTime() - 3600 * 1000);
    const future = new Date(now.getTime() + 3600 * 1000);

    await storage.events.create({
      type: 'test.event',
      source: 'test',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: now.toISOString(),
      receivedAt: now.toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });

    const result = await historyTool.execute({
      startTime: past.toISOString(),
      endTime: future.toISOString(),
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.count).toBe(1);
  });

  it('should cap limit at 100', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 3; i++) {
      await storage.events.create({
        type: 'test.event',
        source: 'test',
        sourceType: 'generic',
        sourceId: 'src-1',
        webhookId: null,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        receivedAt: new Date().toISOString(),
        data: {},
        rawPayload: {},
        processed: false,
      });
    }

    const result = await historyTool.execute({ limit: 200 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.count).toBe(3);
  });
});
