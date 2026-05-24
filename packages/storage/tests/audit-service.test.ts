import { AuditService, DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('AuditService', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM audit_log').run();
  });

  it('should be a singleton', () => {
    const a = AuditService.getInstance();
    const b = AuditService.getInstance();
    expect(a).toBe(b);
  });

  it('log creates entry in audit_log table', async () => {
    await AuditService.getInstance().log('test-user', 'create', 'source', 'src-1');

    const db = DatabaseService.getInstance().getDatabase();
    const rows = db.prepare('SELECT * FROM audit_log').all() as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.actor).toBe('test-user');
    expect(rows[0]?.action).toBe('create');
    expect(rows[0]?.resource_type).toBe('source');
    expect(rows[0]?.resource_id).toBe('src-1');
  });

  it('log handles create action', async () => {
    await AuditService.getInstance().log('admin', 'create', 'source', 'src-1');
    const db = DatabaseService.getInstance().getDatabase();
    const count = (db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('log handles update action', async () => {
    await AuditService.getInstance().log('admin', 'update', 'source', 'src-1', { field: 'name' });
    const db = DatabaseService.getInstance().getDatabase();
    const row = db.prepare('SELECT * FROM audit_log').get() as Record<string, unknown>;
    expect(row.action).toBe('update');
    expect(row.details).toBe(JSON.stringify({ field: 'name' }));
  });

  it('log handles delete action', async () => {
    await AuditService.getInstance().log('system', 'delete', 'subscription', 'sub-1');
    const db = DatabaseService.getInstance().getDatabase();
    const row = db.prepare('SELECT * FROM audit_log').get() as Record<string, unknown>;
    expect(row.action).toBe('delete');
    expect(row.actor).toBe('system');
  });

  it('log handles rotate_secret action', async () => {
    await AuditService.getInstance().log('admin', 'rotate_secret', 'source', 'src-1', {
      rotatedBy: 'admin',
    });
    const db = DatabaseService.getInstance().getDatabase();
    const row = db.prepare('SELECT * FROM audit_log').get() as Record<string, unknown>;
    expect(row.action).toBe('rotate_secret');
    expect(row.details).toBe(JSON.stringify({ rotatedBy: 'admin' }));
  });

  it('log creates multiple entries', async () => {
    await AuditService.getInstance().log('user1', 'create', 'source', 'src-1');
    await AuditService.getInstance().log('user2', 'delete', 'subscription', 'sub-1', {
      reason: 'expired',
    });
    await AuditService.getInstance().log('system', 'rotate_secret', 'source', 'src-1');

    const db = DatabaseService.getInstance().getDatabase();
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY created_at').all() as Record<
      string,
      unknown
    >[];
    expect(rows.length).toBe(3);
  });
});
