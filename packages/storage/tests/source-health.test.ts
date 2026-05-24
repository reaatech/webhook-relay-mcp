import {
  DatabaseService,
  SourceHealthService,
  StorageService,
} from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('SourceHealthService', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
    db.prepare(`
      INSERT INTO webhook_sources (id, name, source_type, endpoint_url, signing_secret, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'src-1',
      'test-source',
      'generic',
      'http://example.com',
      'secret',
      1,
      new Date().toISOString(),
      new Date().toISOString(),
    );
  });

  it('should be a singleton', () => {
    const a = SourceHealthService.getInstance();
    const b = SourceHealthService.getInstance();
    expect(a).toBe(b);
  });

  it('recordEvent updates last_event_at and updated_at', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const before = new Date().toISOString();
    await SourceHealthService.getInstance().recordEvent('test-source');

    const source = db
      .prepare('SELECT last_event_at, updated_at FROM webhook_sources WHERE name = ?')
      .get('test-source') as Record<string, unknown>;
    expect(source.last_event_at).not.toBeNull();
    expect((source.last_event_at as string) >= before).toBe(true);
    expect((source.updated_at as string) >= before).toBe(true);
  });

  it('getHealth returns healthy for source with recent event', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const recent = new Date().toISOString();
    db.prepare('UPDATE webhook_sources SET last_event_at = ? WHERE name = ?').run(
      recent,
      'test-source',
    );

    const health = await SourceHealthService.getInstance().getHealth('test-source');
    expect(health).not.toBeNull();
    expect(health?.name).toBe('test-source');
    expect(health?.lastEventAt).toBe(recent);
    expect(health?.isHealthy).toBe(true);
  });

  it('getHealth returns unhealthy for source with old event', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const oldDate = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    db.prepare('UPDATE webhook_sources SET last_event_at = ? WHERE name = ?').run(
      oldDate,
      'test-source',
    );

    const health = await SourceHealthService.getInstance().getHealth('test-source');
    expect(health).not.toBeNull();
    expect(health?.isHealthy).toBe(false);
  });

  it('getHealth returns unhealthy for source with no events', async () => {
    const health = await SourceHealthService.getInstance().getHealth('test-source');
    expect(health).not.toBeNull();
    expect(health?.name).toBe('test-source');
    expect(health?.lastEventAt).toBeNull();
    expect(health?.isHealthy).toBe(false);
  });

  it('getHealth returns null for non-existent source', async () => {
    const health = await SourceHealthService.getInstance().getHealth('non-existent');
    expect(health).toBeNull();
  });

  it('checkAllSources returns all sources', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare(`
      INSERT INTO webhook_sources (id, name, source_type, endpoint_url, signing_secret, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'src-2',
      'test-source-2',
      'generic',
      'http://example.com',
      'secret',
      1,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const allHealth = await SourceHealthService.getInstance().checkAllSources();
    expect(allHealth.length).toBe(2);
    const names = allHealth.map((h) => h.name).sort();
    expect(names).toEqual(['test-source', 'test-source-2']);
  });

  it('checkAllSources works with empty table', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();

    const allHealth = await SourceHealthService.getInstance().checkAllSources();
    expect(allHealth).toEqual([]);
  });
});
