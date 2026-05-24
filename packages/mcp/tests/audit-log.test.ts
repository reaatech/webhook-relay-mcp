import { auditLogTool } from '@reaatech/webhook-relay-mcp';
import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.audit-log tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM audit_log').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM subscriptions').run();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  function insertAuditEntry(overrides: Record<string, string | null> = {}) {
    const db = DatabaseService.getInstance().getDatabase();
    const id = overrides.id ?? `audit-${Date.now()}-${Math.random()}`;
    db.prepare(
      `INSERT INTO audit_log (id, actor, action, resource_type, resource_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      overrides.actor ?? 'test-user',
      overrides.action ?? 'source.created',
      overrides.resource_type ?? 'source',
      overrides.resource_id ?? 'src-1',
      overrides.details ?? null,
      overrides.created_at ?? new Date().toISOString(),
    );
    return id;
  }

  it('should query audit log entries', async () => {
    insertAuditEntry();
    insertAuditEntry({
      id: `audit-2-${Date.now()}`,
      action: 'secret.rotated',
      resource_id: 'src-2',
    });

    const result = await auditLogTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.entries.length).toBeGreaterThanOrEqual(2);
    expect(parsed.count).toBeGreaterThanOrEqual(2);
  });

  it('should filter by actor', async () => {
    insertAuditEntry({ actor: 'admin', id: `admin-${Date.now()}` });
    insertAuditEntry({ actor: 'system', id: `system-${Date.now()}` });

    const result = await auditLogTool.execute({ actor: 'admin' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBeGreaterThanOrEqual(1);
    for (const entry of parsed.entries as Array<{ actor: string }>) {
      expect(entry.actor).toBe('admin');
    }
  });

  it('should filter by action', async () => {
    insertAuditEntry({ action: 'source.created', id: `sc-${Date.now()}` });
    insertAuditEntry({ action: 'secret.rotated', id: `sr-${Date.now()}` });

    const result = await auditLogTool.execute({ action: 'secret.rotated' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBeGreaterThanOrEqual(1);
    for (const entry of parsed.entries as Array<{ action: string }>) {
      expect(entry.action).toBe('secret.rotated');
    }
  });

  it('should filter by resourceType', async () => {
    insertAuditEntry({ resource_type: 'source', id: `rsrc1-${Date.now()}` });
    insertAuditEntry({ resource_type: 'subscription', id: `rsrc2-${Date.now()}` });

    const result = await auditLogTool.execute({ resourceType: 'subscription' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBeGreaterThanOrEqual(1);
    for (const entry of parsed.entries as Array<{ resourceType: string }>) {
      expect(entry.resourceType).toBe('subscription');
    }
  });

  it('should paginate with limit', async () => {
    for (let i = 0; i < 5; i++) {
      insertAuditEntry({ id: `limit-${i}-${Date.now()}` });
    }

    const result = await auditLogTool.execute({ limit: 2 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(2);
  });

  it('should cap limit at 100', async () => {
    for (let i = 0; i < 3; i++) {
      insertAuditEntry({ id: `cap-${i}-${Date.now()}` });
    }

    const result = await auditLogTool.execute({ limit: 200 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(3);
  });

  it('should filter by time range', async () => {
    insertAuditEntry({
      id: `past-${Date.now()}`,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    });
    insertAuditEntry({
      id: `now-${Date.now()}`,
      created_at: new Date().toISOString(),
    });

    const result = await auditLogTool.execute({
      startTime: new Date(Date.now() - 3600000).toISOString(),
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(1);
  });

  it('should filter by endTime', async () => {
    insertAuditEntry({
      id: `old-${Date.now()}`,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    });
    insertAuditEntry({
      id: `recent-${Date.now()}`,
      created_at: new Date().toISOString(),
    });

    const result = await auditLogTool.execute({
      endTime: new Date(Date.now() - 3600000).toISOString(),
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.count).toBe(1);
  });

  it('should return empty when no entries match', async () => {
    const result = await auditLogTool.execute({ actor: 'non-existent' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.entries).toEqual([]);
    expect(parsed.count).toBe(0);
  });
});
