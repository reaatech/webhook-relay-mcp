import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('EventRepository', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
  });

  async function createEvent(overrides: Record<string, unknown> = {}) {
    const storage = StorageService.getInstance();
    return storage.events.create({
      type: 'test.event',
      source: 'test',
      sourceType: 'generic',
      sourceId: 'src-1',
      webhookId: null,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      data: { foo: 'bar' },
      rawPayload: { id: 'evt-1' },
      processed: false,
      ...overrides,
    });
  }

  it('should create and find an event by id', async () => {
    const storage = StorageService.getInstance();
    const created = await createEvent();
    const found = await storage.events.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.type).toBe('test.event');
  });

  it('should return null for non-existent id', async () => {
    const storage = StorageService.getInstance();
    const found = await storage.events.findById('non-existent');
    expect(found).toBeNull();
  });

  it('should update processed status', async () => {
    const storage = StorageService.getInstance();
    const created = await createEvent();
    const updated = await storage.events.update(created.id, { processed: true });
    expect(updated).toBe(true);

    const found = await storage.events.findById(created.id);
    expect(found?.processed).toBe(true);
  });

  it('should not update disallowed fields', async () => {
    const storage = StorageService.getInstance();
    const created = await createEvent();
    const updated = await storage.events.update(created.id, { type: 'changed' });
    expect(updated).toBe(false);
  });

  it('should delete an event', async () => {
    const storage = StorageService.getInstance();
    const created = await createEvent();
    const deleted = await storage.events.delete(created.id);
    expect(deleted).toBe(true);
    expect(await storage.events.findById(created.id)).toBeNull();
  });

  it('should list events with type filter', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ type: 'payment.completed' });
    await createEvent({ type: 'code.push' });

    const events = await storage.events.list({ types: ['payment.completed'] });
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('payment.completed');
  });

  it('should list events with source filter', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ source: 'stripe' });
    await createEvent({ source: 'github' });

    const events = await storage.events.list({ sources: ['stripe'] });
    expect(events.length).toBe(1);
    expect(events[0]?.source).toBe('stripe');
  });

  it('should list events with correlationId filter', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ correlationId: 'corr-123' });
    await createEvent({ correlationId: 'corr-456' });

    const events = await storage.events.list({ correlationId: 'corr-123' });
    expect(events.length).toBe(1);
  });

  it('should list events with time range', async () => {
    const storage = StorageService.getInstance();
    const now = new Date();
    await createEvent({ timestamp: now.toISOString() });

    const events = await storage.events.list({
      startTime: new Date(now.getTime() - 3600 * 1000).toISOString(),
      endTime: new Date(now.getTime() + 3600 * 1000).toISOString(),
    });
    expect(events.length).toBe(1);
  });

  it('should list events with processed filter', async () => {
    const storage = StorageService.getInstance();
    const e1 = await createEvent({ processed: false });
    await createEvent({ processed: true });

    const unprocessed = await storage.events.list({ processed: false });
    expect(unprocessed.length).toBe(1);
    expect(unprocessed[0]?.id).toBe(e1.id);
  });

  it('should respect limit and offset', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 5; i++) {
      await createEvent({ timestamp: new Date(Date.now() - i * 1000).toISOString() });
    }

    const page1 = await storage.events.list({ limit: 2, offset: 0 });
    expect(page1.length).toBe(2);

    const page2 = await storage.events.list({ limit: 2, offset: 2 });
    expect(page2.length).toBe(2);
  });

  it('should order results', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ timestamp: '2024-01-01T00:00:00Z' });
    await createEvent({ timestamp: '2024-01-02T00:00:00Z' });

    const asc = await storage.events.list({ orderBy: 'timestamp', order: 'ASC' });
    expect(asc[0]?.timestamp).toBe('2024-01-01T00:00:00Z');

    const desc = await storage.events.list({ orderBy: 'timestamp', order: 'DESC' });
    expect(desc[0]?.timestamp).toBe('2024-01-02T00:00:00Z');
  });

  it('should find unprocessed events', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ processed: false });
    await createEvent({ processed: true });

    const unprocessed = await storage.events.findUnprocessed(100);
    expect(unprocessed.length).toBe(1);
    expect(unprocessed[0]?.processed).toBe(false);
  });
});
