import { describe, it, expect, beforeEach } from 'vitest';
import { CleanupService } from '../../../src/services/cleanup.js';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('CleanupService', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM subscription_events').run();
  });

  it('should delete events older than retention period', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date();

    // Insert a recent event
    db.prepare(
      `
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'evt_recent',
      'test.event',
      'test',
      'generic',
      'src-1',
      now.toISOString(),
      now.toISOString(),
      '{}',
      '{}',
      now.toISOString()
    );

    // Insert an old event (40 days ago)
    const oldDate = new Date(now);
    oldDate.setDate(oldDate.getDate() - 40);
    db.prepare(
      `
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'evt_old',
      'test.event',
      'test',
      'generic',
      'src-2',
      oldDate.toISOString(),
      oldDate.toISOString(),
      '{}',
      '{}',
      oldDate.toISOString()
    );

    const cleanup = new CleanupService();
    const result = await cleanup.runCleanup();

    expect(result.deletedEvents).toBe(1);

    const remaining = db.prepare('SELECT id FROM events').all() as { id: string }[];
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.id).toBe('evt_recent');
  });

  it('should not delete events within retention period', async () => {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date();

    db.prepare(
      `
      INSERT INTO events (id, type, source, source_type, source_id, timestamp, received_at, data, raw_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'evt_recent',
      'test.event',
      'test',
      'generic',
      'src-1',
      now.toISOString(),
      now.toISOString(),
      '{}',
      '{}',
      now.toISOString()
    );

    const cleanup = new CleanupService();
    const result = await cleanup.runCleanup();

    expect(result.deletedEvents).toBe(0);

    const remaining = db.prepare('SELECT id FROM events').all() as { id: string }[];
    expect(remaining.length).toBe(1);
  });

  it('should skip if already running', async () => {
    const cleanup = new CleanupService();

    // Manually set isRunning to true
    (cleanup as unknown as { isRunning: boolean }).isRunning = true;

    const result = await cleanup.runCleanup();
    expect(result.deletedEvents).toBe(0);
    expect(result.deletedSubscriptionEvents).toBe(0);
  });
});
