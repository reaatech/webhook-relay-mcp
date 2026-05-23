import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@reaatech/webhook-relay-core';
import { config } from '@reaatech/webhook-relay-core';
import Database from 'better-sqlite3';

export class DatabaseService {
  private static instance: DatabaseService;
  private db: Database.Database | null = null;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  connect(): Database.Database {
    if (this.db) {
      return this.db;
    }

    const dbPath = config.databasePath;

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath, {
      verbose:
        config.nodeEnv === 'development'
          ? (sql: unknown) => logger.debug({ sql: String(sql) })
          : undefined,
    });

    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.db.pragma('temp_store = memory');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    logger.info({ database: dbPath }, 'Database connected');
    return this.db;
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info({}, 'Database disconnected');
    }
  }
}
