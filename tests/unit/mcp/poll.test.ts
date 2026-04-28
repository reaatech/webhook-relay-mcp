import { describe, it, expect, beforeEach } from 'vitest';
import { pollTool } from '../../../src/mcp/tools/poll.js';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('webhooks.poll tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM subscriptions').run();
  });

  it('should return existing events', async () => {
    const storage = StorageService.getInstance();
    const sub = await storage.subscriptions.create({
      eventTypes: ['payment.completed'],
      isActive: true,
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

    const result = await pollTool.execute({ subscriptionId: sub.id, timeout: 1 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.events.length).toBeGreaterThanOrEqual(1);
    expect(parsed.waited).toBe(false);
  });

  it('should timeout when no events exist', async () => {
    const storage = StorageService.getInstance();
    const sub = await storage.subscriptions.create({
      eventTypes: ['payment.completed'],
      isActive: true,
    });

    const result = await pollTool.execute({ subscriptionId: sub.id, timeout: 0.1 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.events).toEqual([]);
    expect(parsed.waited).toBe(true);
    expect(parsed.timedOut).toBe(true);
  });

  it('should reject non-existent subscription', async () => {
    await expect(pollTool.execute({ subscriptionId: 'non-existent', timeout: 1 })).rejects.toThrow(
      'not found'
    );
  });

  it('should reject inactive subscription', async () => {
    const storage = StorageService.getInstance();
    const sub = await storage.subscriptions.create({
      eventTypes: ['test.event'],
      isActive: false,
    });

    await expect(pollTool.execute({ subscriptionId: sub.id, timeout: 1 })).rejects.toThrow(
      'not active'
    );
  });

  it('should reject expired subscription', async () => {
    const storage = StorageService.getInstance();
    const sub = await storage.subscriptions.create({
      eventTypes: ['test.event'],
      isActive: true,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(pollTool.execute({ subscriptionId: sub.id, timeout: 1 })).rejects.toThrow(
      'expired'
    );
  });

  it('should filter by eventTypes override', async () => {
    const storage = StorageService.getInstance();
    const sub = await storage.subscriptions.create({
      eventTypes: ['payment.completed', 'code.push'],
      isActive: true,
    });
    await storage.events.create({
      type: 'code.push',
      source: 'github',
      sourceType: 'github',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: {},
      rawPayload: {},
      processed: false,
    });

    const result = await pollTool.execute({
      subscriptionId: sub.id,
      eventTypes: ['code.push'],
      timeout: 1,
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.events.length).toBe(1);
    expect(parsed.events[0]?.type).toBe('code.push');
  });

  it('should respect limit parameter', async () => {
    const storage = StorageService.getInstance();
    const sub = await storage.subscriptions.create({
      eventTypes: ['test.event'],
      isActive: true,
    });
    for (let i = 0; i < 5; i++) {
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

    const result = await pollTool.execute({ subscriptionId: sub.id, limit: 2, timeout: 1 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.events.length).toBe(2);
    expect(parsed.hasMore).toBe(true);
  });
});
