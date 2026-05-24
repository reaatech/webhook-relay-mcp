import { MigrationService } from '@reaatech/webhook-relay-storage';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

describe('MigrationService', () => {
  it('getCurrentVersion returns 0 on new database', () => {
    const db = new Database(':memory:');
    expect(MigrationService.getCurrentVersion(db)).toBe(0);
  });

  it('run applies all migrations and creates tables', () => {
    const db = new Database(':memory:');
    MigrationService.run(db);

    const version = MigrationService.getCurrentVersion(db);
    expect(version).toBeGreaterThan(0);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('events');
    expect(names).toContain('webhook_sources');
    expect(names).toContain('subscriptions');
    expect(names).toContain('subscription_events');
    expect(names).toContain('schema_migrations');
    expect(names).toContain('audit_log');
  });

  it('run on up-to-date database is no-op', () => {
    const db = new Database(':memory:');
    MigrationService.run(db);
    const version1 = MigrationService.getCurrentVersion(db);

    MigrationService.run(db);
    const version2 = MigrationService.getCurrentVersion(db);

    expect(version2).toBe(version1);
  });
});
