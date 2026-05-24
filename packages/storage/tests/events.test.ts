import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

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

  it('should find by webhook id', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ source: 'stripe', webhookId: 'wh_123' });
    await createEvent({ source: 'stripe', webhookId: 'wh_456' });

    const found = await storage.events.findByWebhookId('stripe', 'wh_123');
    expect(found).not.toBeNull();
    expect(found?.webhookId).toBe('wh_123');
  });

  it('should return null for non-existent webhook id', async () => {
    const storage = StorageService.getInstance();
    const found = await storage.events.findByWebhookId('stripe', 'wh_none');
    expect(found).toBeNull();
  });

  it('should find by delivery status', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ deliveryStatus: 'pending' });
    await createEvent({ deliveryStatus: 'delivered' });

    const pending = await storage.events.findByDeliveryStatus('pending');
    expect(pending.length).toBe(1);
    expect(pending[0]?.deliveryStatus).toBe('pending');
  });

  it('should find retryable events', async () => {
    const storage = StorageService.getInstance();
    const now = new Date();
    const past = new Date(now.getTime() - 3600 * 1000).toISOString();

    await createEvent({
      deliveryStatus: 'failed',
      retryCount: 1,
      nextRetryAt: past,
    });
    await createEvent({
      deliveryStatus: 'pending',
      retryCount: 0,
      nextRetryAt: past,
    });
    await createEvent({
      deliveryStatus: 'delivered',
      retryCount: 0,
    });

    const retryable = await storage.events.findRetryable();
    expect(retryable.length).toBe(2);
  });

  it('should update delivery status', async () => {
    const storage = StorageService.getInstance();
    const created = await createEvent({ deliveryStatus: 'pending' });

    const updated = await storage.events.updateDeliveryStatus(
      created.id,
      'failed',
      'Connection error',
    );
    expect(updated).toBe(true);

    const found = await storage.events.findById(created.id);
    expect(found?.deliveryStatus).toBe('failed');
    expect(found?.lastError).toBe('Connection error');
  });

  it('should list with cursor pagination', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ timestamp: '2024-01-02T00:00:00Z', type: 'a', source: 'src-a' });
    await createEvent({ timestamp: '2024-01-01T00:00:00Z', type: 'b', source: 'src-b' });

    const first = await storage.events.list({ orderBy: 'timestamp', order: 'DESC', limit: 1 });
    expect(first.length).toBe(1);

    const afterFirst = await storage.events.list({
      cursorTimestamp: first[0]?.timestamp ?? '',
      cursorId: first[0]?.id ?? '',
      orderBy: 'timestamp',
      order: 'DESC',
    });
    expect(afterFirst.length).toBe(1);
  });

  it('should fallback to default orderBy for invalid field', async () => {
    const storage = StorageService.getInstance();
    await createEvent({ timestamp: '2024-01-02T00:00:00Z' });
    await createEvent({ timestamp: '2024-01-01T00:00:00Z' });

    const result = await storage.events.list({ orderBy: 'invalid_field', order: 'ASC' });
    expect(result.length).toBe(2);
  });
});
