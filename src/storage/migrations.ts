import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { SCHEMA_VERSION, MIGRATIONS } from './schema.js';

export const MigrationService = {
  run(db: Database.Database): void {
    const currentVersion = this.getCurrentVersion(db);

    if (currentVersion >= SCHEMA_VERSION) {
      logger.info(
        { currentVersion, targetVersion: SCHEMA_VERSION },
        'Database schema is up to date'
      );
      return;
    }

    logger.info({ currentVersion, targetVersion: SCHEMA_VERSION }, 'Running database migrations');

    for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
      const migration = MIGRATIONS[version];
      if (!migration) {
        throw new Error(`Migration ${version} not found`);
      }

      logger.info({ version }, `Applying migration ${version}`);

      for (const sql of migration) {
        db.exec(sql);
      }
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))"
      ).run(version);
      logger.info({ version }, `Migration ${version} applied successfully`);
    }

    logger.info({ version: SCHEMA_VERSION }, 'All migrations completed');
  },

  getCurrentVersion(db: Database.Database): number {
    try {
      const result = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as
        | { version: number }
        | undefined;

      return result?.version ?? 0;
    } catch {
      return 0;
    }
  },
};
