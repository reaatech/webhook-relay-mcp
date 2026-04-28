import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('SourceRepository', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  async function createSource(overrides: Record<string, unknown> = {}) {
    const storage = StorageService.getInstance();
    return storage.sources.create({
      name: `test-source-${Date.now()}`,
      sourceType: 'generic',
      endpointUrl: 'http://localhost/webhooks/test',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
      ...overrides,
    });
  }

  it('should create and find by id', async () => {
    const storage = StorageService.getInstance();
    const created = await createSource();
    const found = await storage.sources.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe(created.name);
  });

  it('should return null for non-existent id', async () => {
    const storage = StorageService.getInstance();
    expect(await storage.sources.findById('missing')).toBeNull();
  });

  it('should find by name', async () => {
    const storage = StorageService.getInstance();
    const created = await createSource({ name: 'my-source' });
    const found = await storage.sources.findByName('my-source');
    expect(found?.id).toBe(created.id);
  });

  it('should return null for non-existent name', async () => {
    const storage = StorageService.getInstance();
    expect(await storage.sources.findByName('missing')).toBeNull();
  });

  it('should find by source type', async () => {
    const storage = StorageService.getInstance();
    await createSource({ sourceType: 'stripe', name: 's1' });
    await createSource({ sourceType: 'stripe', name: 's2', isActive: false });
    await createSource({ sourceType: 'github', name: 's3' });

    const stripe = await storage.sources.findBySourceType('stripe');
    expect(stripe.length).toBe(1);
    expect(stripe[0]?.sourceType).toBe('stripe');
  });

  it('should update allowed fields', async () => {
    const storage = StorageService.getInstance();
    const created = await createSource();

    const updated = await storage.sources.update(created.id, {
      name: 'new-name',
      endpointUrl: 'http://new.url',
      signingSecret: 'new-secret',
      isActive: false,
    });
    expect(updated).toBe(true);

    const found = await storage.sources.findById(created.id);
    expect(found?.name).toBe('new-name');
    expect(found?.isActive).toBe(false);
  });

  it('should not update disallowed fields', async () => {
    const storage = StorageService.getInstance();
    const created = await createSource();
    const updated = await storage.sources.update(created.id, { sourceType: 'changed' });
    expect(updated).toBe(false);
  });

  it('should delete a source', async () => {
    const storage = StorageService.getInstance();
    const created = await createSource();
    const deleted = await storage.sources.delete(created.id);
    expect(deleted).toBe(true);
    expect(await storage.sources.findById(created.id)).toBeNull();
  });

  it('should list sources with limit', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 5; i++) {
      await createSource({ name: `src-${i}` });
    }

    const list = await storage.sources.list({ limit: 3 });
    expect(list.length).toBe(3);
  });
});
