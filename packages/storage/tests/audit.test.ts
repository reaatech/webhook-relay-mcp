import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('AuditRepository', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM audit_log').run();
  });

  it('should create and find by id', async () => {
    const storage = StorageService.getInstance();
    const created = await storage.audit.create({
      actor: 'test-user',
      action: 'test.action',
      resourceType: 'source',
      resourceId: 'src-1',
    });

    expect(created.id).toBeDefined();
    expect(created.actor).toBe('test-user');
    expect(created.action).toBe('test.action');
    expect(created.resourceType).toBe('source');
    expect(created.resourceId).toBe('src-1');
    expect(created.createdAt).toBeDefined();

    const found = await storage.audit.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.actor).toBe('test-user');
    expect(found?.action).toBe('test.action');
    expect(found?.resourceType).toBe('source');
    expect(found?.resourceId).toBe('src-1');
  });

  it('should return null for non-existent id', async () => {
    const storage = StorageService.getInstance();
    const found = await storage.audit.findById('non-existent');
    expect(found).toBeNull();
  });

  it('should create with optional details', async () => {
    const storage = StorageService.getInstance();
    const details = { reason: 'test', ip: '127.0.0.1' };
    const created = await storage.audit.create({
      actor: 'admin',
      action: 'update',
      resourceType: 'subscription',
      resourceId: 'sub-1',
      details,
    });

    expect(created.details).toEqual(details);

    const found = await storage.audit.findById(created.id);
    expect(found?.details).toEqual(details);
  });

  it('should list with actor filter', async () => {
    const storage = StorageService.getInstance();
    await storage.audit.create({
      actor: 'user1',
      action: 'create',
      resourceType: 'source',
      resourceId: 'src-1',
    });
    await storage.audit.create({
      actor: 'user2',
      action: 'create',
      resourceType: 'source',
      resourceId: 'src-2',
    });
    await storage.audit.create({
      actor: 'user1',
      action: 'delete',
      resourceType: 'source',
      resourceId: 'src-3',
    });

    const results = await storage.audit.list({ actor: 'user1' });
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.actor).toBe('user1');
    }
  });

  it('should list with action filter', async () => {
    const storage = StorageService.getInstance();
    await storage.audit.create({
      actor: 'user1',
      action: 'create',
      resourceType: 'source',
      resourceId: 'src-1',
    });
    await storage.audit.create({
      actor: 'user2',
      action: 'delete',
      resourceType: 'source',
      resourceId: 'src-2',
    });

    const results = await storage.audit.list({ action: 'create' });
    expect(results.length).toBe(1);
    expect(results[0]?.action).toBe('create');
  });

  it('should list with resourceType filter', async () => {
    const storage = StorageService.getInstance();
    await storage.audit.create({
      actor: 'user1',
      action: 'create',
      resourceType: 'source',
      resourceId: 'src-1',
    });
    await storage.audit.create({
      actor: 'user2',
      action: 'create',
      resourceType: 'subscription',
      resourceId: 'sub-1',
    });

    const results = await storage.audit.list({ resourceType: 'source' });
    expect(results.length).toBe(1);
    expect(results[0]?.resourceType).toBe('source');
  });

  it('should list with date range filter', async () => {
    const storage = StorageService.getInstance();
    const now = new Date();
    await storage.audit.create({
      actor: 'user1',
      action: 'create',
      resourceType: 'source',
      resourceId: 'src-1',
    });

    const results = await storage.audit.list({
      startTime: new Date(now.getTime() - 3600 * 1000).toISOString(),
      endTime: new Date(now.getTime() + 3600 * 1000).toISOString(),
    });
    expect(results.length).toBe(1);
  });

  it('should list with combined filters', async () => {
    const storage = StorageService.getInstance();
    await storage.audit.create({
      actor: 'user1',
      action: 'create',
      resourceType: 'source',
      resourceId: 'src-1',
    });
    await storage.audit.create({
      actor: 'user1',
      action: 'delete',
      resourceType: 'source',
      resourceId: 'src-2',
    });

    const results = await storage.audit.list({ actor: 'user1', action: 'create' });
    expect(results.length).toBe(1);
  });

  it('should list with limit', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 5; i++) {
      await storage.audit.create({
        actor: 'user1',
        action: 'create',
        resourceType: 'source',
        resourceId: `src-${i}`,
      });
    }

    const results = await storage.audit.list({ limit: 3 });
    expect(results.length).toBe(3);
  });

  it('should order results', async () => {
    const storage = StorageService.getInstance();
    await storage.audit.create({
      actor: 'user1',
      action: 'first',
      resourceType: 'source',
      resourceId: 'src-1',
    });
    await new Promise((r) => setTimeout(r, 10));
    await storage.audit.create({
      actor: 'user1',
      action: 'second',
      resourceType: 'source',
      resourceId: 'src-2',
    });

    const desc = await storage.audit.list({ order: 'DESC' });
    expect(desc[0]?.action).toBe('second');

    const asc = await storage.audit.list({ order: 'ASC' });
    expect(asc[0]?.action).toBe('first');
  });

  it('should return empty list when no matches', async () => {
    const storage = StorageService.getInstance();
    const results = await storage.audit.list({ actor: 'nonexistent' });
    expect(results).toEqual([]);
  });

  it('should return empty list from empty table', async () => {
    const storage = StorageService.getInstance();
    const results = await storage.audit.list();
    expect(results).toEqual([]);
  });

  it('should delete an entry', async () => {
    const storage = StorageService.getInstance();
    const created = await storage.audit.create({
      actor: 'user1',
      action: 'create',
      resourceType: 'source',
      resourceId: 'src-1',
    });

    const deleted = await storage.audit.delete(created.id);
    expect(deleted).toBe(true);

    const found = await storage.audit.findById(created.id);
    expect(found).toBeNull();
  });

  it('should return false when deleting non-existent', async () => {
    const storage = StorageService.getInstance();
    const deleted = await storage.audit.delete('non-existent');
    expect(deleted).toBe(false);
  });

  it('update always returns false', async () => {
    const storage = StorageService.getInstance();
    const result = await storage.audit.update();
    expect(result).toBe(false);
  });
});
