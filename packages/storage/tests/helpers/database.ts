import { MigrationService } from '@reaatech/webhook-relay-storage';
import Database from 'better-sqlite3';

export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  MigrationService.run(db);
  return db;
}

export function cleanupTestDatabase(db: Database.Database): void {
  db.close();
}
