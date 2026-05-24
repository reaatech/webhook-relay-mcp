import { replayTool } from '@reaatech/webhook-relay-mcp';
import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.replay tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
  });

  it('should replay a single event by ID', async () => {
    const storage = StorageService.getInstance();
    const event = await storage.events.create({
      type: 'payment.completed',
      source: 'stripe',
      sourceType: 'stripe',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: { amount: 5000 },
      rawPayload: { id: 'evt_1', type: 'invoice.payment_succeeded' },
      processed: false,
    });

    const result = await replayTool.execute({ eventId: event.id });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(1);
    expect(parsed.replayedEvents[0]?.eventId).toBe(event.id);
    expect(parsed.replayedEvents[0]?.source).toBe('stripe');
    expect(parsed.replayedEvents[0]?.original.data).toEqual({ amount: 5000 });
  });

  it('should replay events by time range', async () => {
    const storage = StorageService.getInstance();
    await storage.events.create({
      type: 'code.push',
      source: 'github',
      sourceType: 'github',
      sourceId: 'src-2',
      webhookId: null,
      timestamp: new Date(Date.now() - 5000).toISOString(),
      receivedAt: new Date().toISOString(),
      data: { ref: 'main' },
      rawPayload: {},
      processed: false,
    });

    const result = await replayTool.execute({
      startTime: new Date(Date.now() - 60000).toISOString(),
      endTime: new Date().toISOString(),
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(1);
    expect(parsed.replayedEvents[0]?.type).toBe('code.push');
  });

  it('should throw for non-existent event', async () => {
    await expect(replayTool.execute({ eventId: 'non-existent-id' })).rejects.toThrow('not found');
  });

  it('should respect limit parameter for time range', async () => {
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
        rawPayload: {},
        processed: false,
      });
    }

    const result = await replayTool.execute({
      startTime: new Date(Date.now() - 60000).toISOString(),
      endTime: new Date().toISOString(),
      limit: 2,
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(2);
  });

  it('should cap limit at 50', async () => {
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
        rawPayload: {},
        processed: false,
      });
    }

    const result = await replayTool.execute({
      startTime: new Date(Date.now() - 60000).toISOString(),
      endTime: new Date().toISOString(),
      limit: 200,
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(5);
  });
});
