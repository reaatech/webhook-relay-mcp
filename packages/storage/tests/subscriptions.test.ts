import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('SubscriptionRepository', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM subscriptions').run();
  });

  async function createSub(overrides: Record<string, unknown> = {}) {
    const storage = StorageService.getInstance();
    return storage.subscriptions.create({
      eventTypes: ['test.*'],
      isActive: true,
      ...overrides,
    });
  }

  it('should create and find by id', async () => {
    const storage = StorageService.getInstance();
    const created = await createSub();
    const found = await storage.subscriptions.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.eventTypes).toEqual(['test.*']);
  });

  it('should return null for non-existent id', async () => {
    const storage = StorageService.getInstance();
    expect(await storage.subscriptions.findById('missing')).toBeNull();
  });

  it('should update allowed fields', async () => {
    const storage = StorageService.getInstance();
    const created = await createSub();

    const updated = await storage.subscriptions.update(created.id, {
      filters: { source: 'stripe' },
      isActive: false,
      lastPolledAt: new Date().toISOString(),
    });
    expect(updated).toBe(true);

    const found = await storage.subscriptions.findById(created.id);
    expect(found?.isActive).toBe(false);
    expect(found?.filters).toEqual({ source: 'stripe' });
  });

  it('should not update disallowed fields', async () => {
    const storage = StorageService.getInstance();
    const created = await createSub();
    const updated = await storage.subscriptions.update(created.id, { eventTypes: ['changed'] });
    expect(updated).toBe(false);
  });

  it('should delete a subscription', async () => {
    const storage = StorageService.getInstance();
    const created = await createSub();
    const deleted = await storage.subscriptions.delete(created.id);
    expect(deleted).toBe(true);
    expect(await storage.subscriptions.findById(created.id)).toBeNull();
  });

  it('should list subscriptions', async () => {
    const storage = StorageService.getInstance();
    await createSub({ eventTypes: ['a.*'] });
    await createSub({ eventTypes: ['b.*'] });

    const list = await storage.subscriptions.list();
    expect(list.length).toBe(2);
  });

  it('should find active subscriptions', async () => {
    const storage = StorageService.getInstance();
    await createSub({ isActive: true });
    await createSub({ isActive: false });

    const active = await storage.subscriptions.findActive();
    expect(active.length).toBe(1);
    expect(active[0]?.isActive).toBe(true);
  });

  it('should find by event type with exact match', async () => {
    const storage = StorageService.getInstance();
    await createSub({ eventTypes: ['payment.completed'] });
    await createSub({ eventTypes: ['code.push'] });

    const found = await storage.subscriptions.findByEventType('payment.completed');
    expect(found.length).toBe(1);
    expect(found[0]?.eventTypes).toContain('payment.completed');
  });

  it('should find by event type with wildcard', async () => {
    const storage = StorageService.getInstance();
    await createSub({ eventTypes: ['payment.*'] });
    await createSub({ eventTypes: ['code.push'] });

    const found = await storage.subscriptions.findByEventType('payment.completed');
    expect(found.length).toBe(1);
    expect(found[0]?.eventTypes).toContain('payment.*');
  });

  it('should match universal wildcard', async () => {
    const storage = StorageService.getInstance();
    await createSub({ eventTypes: ['*'] });

    const found = await storage.subscriptions.findByEventType('anything.here');
    expect(found.length).toBe(1);
  });

  it('should find by event type and respect is_active', async () => {
    const storage = StorageService.getInstance();
    await createSub({ eventTypes: ['test.*'], isActive: false });
    await createSub({ eventTypes: ['test.*'], isActive: true });

    const found = await storage.subscriptions.findByEventType('test.event');
    expect(found.length).toBe(1);
    expect(found[0]?.isActive).toBe(true);
  });

  it('should list with offset', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 5; i++) {
      await createSub({ eventTypes: [`type.${i}`] });
    }

    const page = await storage.subscriptions.list({ limit: 2, offset: 2 });
    expect(page.length).toBe(2);
  });

  it('should mark events as delivered', async () => {
    const storage = StorageService.getInstance();
    const sub = await createSub();

    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('evt-mark-1', 'test.event', 'test', 'generic', 'src-1', now, now, '{}', '{}', now);

    await storage.subscriptions.markDelivered(sub.id, ['evt-mark-1']);

    const rows = db.prepare('SELECT * FROM subscription_events').all() as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.subscription_id).toBe(sub.id);
    expect(rows[0]?.event_id).toBe('evt-mark-1');
  });
});
