import { DatabaseService, DeliveryService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DeliveryService', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
  });

  it('should be a singleton', () => {
    const a = DeliveryService.getInstance();
    const b = DeliveryService.getInstance();
    expect(a).toBe(b);
  });

  it('should return zero counts when no retryable events', async () => {
    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result).toEqual({ attempted: 0, succeeded: 0, dead: 0 });
  });

  it('should process pending events', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'pending',
      0,
    );

    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result.attempted).toBe(1);

    const event = db
      .prepare('SELECT delivery_status, retry_count, next_retry_at FROM events WHERE id = ?')
      .get('evt-1') as Record<string, unknown>;
    expect(event.delivery_status).toBe('failed');
    expect(event.retry_count).toBe(1);
    expect(event.next_retry_at).not.toBeNull();
  });

  it('should process failed events with null next_retry_at', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'failed',
      1,
    );

    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result.attempted).toBe(1);

    const event = db
      .prepare('SELECT delivery_status, retry_count, next_retry_at FROM events WHERE id = ?')
      .get('evt-1') as Record<string, unknown>;
    expect(event.delivery_status).toBe('failed');
    expect(event.retry_count).toBe(2);
  });

  it('should process failed events with past next_retry_at', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count, next_retry_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'failed',
      2,
      past,
    );

    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result.attempted).toBe(1);
  });

  it('should mark events as dead after max retries', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'failed',
      4,
    );

    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result.attempted).toBe(1);
    expect(result.dead).toBe(1);

    const event = db
      .prepare(
        'SELECT delivery_status, retry_count, last_error, next_retry_at FROM events WHERE id = ?',
      )
      .get('evt-1') as Record<string, unknown>;
    expect(event.delivery_status).toBe('dead');
    expect(event.retry_count).toBe(5);
    expect(event.last_error).toBe('Max retries exceeded');
    expect(event.next_retry_at).toBeNull();
  });

  it('should not process events with future next_retry_at', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count, next_retry_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'failed',
      1,
      future,
    );

    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result.attempted).toBe(0);
  });

  it('should not process delivered events', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'delivered',
    );

    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result.attempted).toBe(0);
  });

  it('should process multiple events', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'pending',
      0,
    );
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-2',
      'test.event',
      'test',
      'generic',
      'src-2',
      now,
      now,
      '{}',
      '{}',
      now,
      'failed',
      1,
    );

    const result = await DeliveryService.getInstance().processDeliveryQueue();
    expect(result.attempted).toBe(2);
  });

  it('should calculate exponential backoff', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at, delivery_status, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'evt-1',
      'test.event',
      'test',
      'generic',
      'src-1',
      now,
      now,
      '{}',
      '{}',
      now,
      'pending',
      0,
    );

    await DeliveryService.getInstance().processDeliveryQueue();

    const event = db
      .prepare('SELECT retry_count, next_retry_at FROM events WHERE id = ?')
      .get('evt-1') as Record<string, unknown>;
    expect(event.retry_count).toBe(1);
    const nextRetryTime = new Date(event.next_retry_at as string).getTime();
    expect(nextRetryTime).toBeGreaterThan(Date.now());
    expect(nextRetryTime).toBeLessThanOrEqual(Date.now() + 2000);
  });

  describe('deliverEvent', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should succeed on HTTP 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      try {
        const storage = StorageService.getInstance();
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

        const result = await DeliveryService.getInstance().deliverEvent(
          event,
          'http://example.com',
          'test-secret',
        );
        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should fail on HTTP error status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', mockFetch);

      try {
        const storage = StorageService.getInstance();
        const event = await storage.events.create({
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

        const result = await DeliveryService.getInstance().deliverEvent(
          event,
          'http://example.com',
          'secret',
        );
        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(500);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should handle network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);

      try {
        const storage = StorageService.getInstance();
        const event = await storage.events.create({
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

        const result = await DeliveryService.getInstance().deliverEvent(
          event,
          'http://example.com',
          'secret',
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe('ECONNREFUSED');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
