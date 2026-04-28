# Skill: Database Design

## Description

This skill handles SQLite database schema design, migrations, and optimization for webhook-relay-mcp. It implements a robust, performant data persistence layer using the repository pattern.

## Capabilities

- Design SQLite schema for events, subscriptions, and webhook sources
- Implement database migrations with versioning
- Create repository pattern for data access abstraction
- Configure SQLite for optimal performance (WAL mode, pragmas)
- Implement connection pooling and error handling
- Add indexes for common query patterns
- Set up backup and recovery procedures

## Required Context

- **Database**: SQLite 3 with better-sqlite3
- **Project**: webhook-relay-mcp
- **Architecture**: See ARCHITECTURE.md storage layer section
- **Dependencies**: better-sqlite3, uuid, ulid, zod

## Implementation Steps

### 1. Database Connection Setup

Create `src/storage/database.ts`:
```typescript
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs';

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
    
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath, {
      verbose: config.nodeEnv === 'development' ? console.log : undefined,
    });

    // Optimize SQLite for concurrent access
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
      logger.info({ }, 'Database disconnected');
    }
  }
}
```

### 2. Schema Definition

Create `src/storage/schema.ts`:
```typescript
export const SCHEMA_VERSION = 1;

export const SCHEMA = `
  -- Enable foreign keys
  PRAGMA foreign_keys = ON;

  -- Registered webhook sources
  CREATE TABLE IF NOT EXISTS webhook_sources (
    id TEXT PRIMARY KEY,              -- ULID
    name TEXT NOT NULL UNIQUE,         -- e.g., "stripe-production"
    source_type TEXT NOT NULL,         -- e.g., "stripe", "github"
    endpoint_url TEXT NOT NULL,        -- Public URL for receiving webhooks
    signing_secret TEXT NOT NULL,      -- Encrypted at rest
    is_active INTEGER DEFAULT 1,       -- BOOLEAN (SQLite doesn't have native bool)
    created_at TEXT NOT NULL,          -- ISO 8601
    updated_at TEXT NOT NULL           -- ISO 8601
  );

  -- Normalized events
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,               -- ULID
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,         -- Original event type from source
    source_id TEXT NOT NULL,           -- FK to webhook_sources.id
    timestamp TEXT NOT NULL,           -- ISO 8601 (when event occurred at source)
    received_at TEXT NOT NULL,         -- ISO 8601 (when we received it)
    correlation_id TEXT,               -- For tracing across systems
    data TEXT NOT NULL,                -- JSON (normalized payload)
    raw_payload TEXT NOT NULL,         -- JSON (original payload)
    metadata TEXT,                     -- JSON (source-specific metadata)
    processed INTEGER DEFAULT 0,       -- BOOLEAN
    created_at TEXT NOT NULL           -- ISO 8601
  );

  -- Event subscriptions
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,               -- ULID
    event_types TEXT NOT NULL,         -- JSON array of patterns
    filters TEXT,                      -- JSON filter conditions
    created_at TEXT NOT NULL,          -- ISO 8601
    expires_at TEXT,                   -- ISO 8601, nullable
    is_active INTEGER DEFAULT 1,       -- BOOLEAN
    last_polled_at TEXT                -- ISO 8601, nullable
  );

  -- Subscription event delivery tracking
  CREATE TABLE IF NOT EXISTS subscription_events (
    id TEXT PRIMARY KEY,               -- ULID
    subscription_id TEXT NOT NULL,     -- FK to subscriptions.id
    event_id TEXT NOT NULL,            -- FK to events.id
    delivered_at TEXT,                 -- ISO 8601 when delivered to subscriber
    read_at TEXT,                      -- ISO 8601 when read by consumer
    created_at TEXT NOT NULL,          -- ISO 8601
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  -- Database schema versioning
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  -- Performance indexes
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlation_id) 
    WHERE correlation_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_events_source_timestamp ON events(source, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_source_type ON events(source, type);
  CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed) WHERE processed = 0;
  
  CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription ON subscription_events(subscription_id);
  CREATE INDEX IF NOT EXISTS idx_subscription_events_event ON subscription_events(event_id);
  CREATE INDEX IF NOT EXISTS idx_subscription_events_unread ON subscription_events(subscription_id, read_at) 
    WHERE read_at IS NULL;
  
  CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(is_active) WHERE is_active = 1;
  CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at) 
    WHERE expires_at IS NOT NULL;
`;

export const MIGRATIONS: Record<number, string[]> = {
  1: [SCHEMA], // Initial schema
};
```

### 3. Migration System

Create `src/storage/migrations.ts`:
```typescript
import { Database } from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { SCHEMA_VERSION, MIGRATIONS } from './schema.js';

export class MigrationService {
  static async run(db: Database): Promise<void> {
    // Get current version
    const currentVersion = this.getCurrentVersion(db);
    
    if (currentVersion >= SCHEMA_VERSION) {
      logger.info({ currentVersion, targetVersion: SCHEMA_VERSION }, 'Database schema is up to date');
      return;
    }

    logger.info({ currentVersion, targetVersion: SCHEMA_VERSION }, 'Running database migrations');

    // Run migrations in order
    for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
      const migration = MIGRATIONS[version];
      if (!migration) {
        throw new Error(`Migration ${version} not found`);
      }

      logger.info({ version }, `Applying migration ${version}`);
      
      // Run migration in a transaction
      db.transaction(() => {
        for (const sql of migration) {
          db.exec(sql);
        }
        db.exec(
          `INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))`,
          version
        );
      })();

      logger.info({ version }, `Migration ${version} applied successfully`);
    }

    logger.info({ version: SCHEMA_VERSION }, 'All migrations completed');
  }

  private static getCurrentVersion(db: Database): number {
    try {
      const result = db.prepare(
        'SELECT MAX(version) as version FROM schema_migrations'
      ).get() as { version: number } | undefined;
      
      return result?.version ?? 0;
    } catch (error) {
      // Table doesn't exist yet
      return 0;
    }
  }
}
```

### 4. Repository Pattern

Create `src/storage/repositories/base.ts`:
```typescript
import { Database } from 'better-sqlite3';

export interface Repository<T, ID = string> {
  create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  findById(id: ID): Promise<T | null>;
  update(id: ID, updates: Partial<T>): Promise<boolean>;
  delete(id: ID): Promise<boolean>;
  list(options?: ListOptions): Promise<T[]>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}

export abstract class BaseRepository<T, ID = string> implements Repository<T, ID> {
  protected db: Database;
  protected tableName: string;

  constructor(db: Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  abstract create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  abstract findById(id: ID): Promise<T | null>;
  abstract update(id: ID, updates: Partial<T>): Promise<boolean>;
  abstract delete(id: ID): Promise<boolean>;
  abstract list(options?: ListOptions): Promise<T[]>;

  protected parseJSON<T>(value: string | null): T | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  protected toJSON(value: unknown): string {
    return JSON.stringify(value);
  }
}
```

Create `src/storage/repositories/events.ts`:
```typescript
import { Database } from 'better-sqlite3';
import { BaseRepository, ListOptions } from './base.js';
import { ulid } from 'ulid';

export interface EventEntity {
  id: string;
  type: string;
  source: string;
  sourceType: string;
  sourceId: string;
  timestamp: string;
  receivedAt: string;
  correlationId?: string;
  data: Record<string, unknown>;
  rawPayload: unknown;
  metadata?: Record<string, unknown>;
  processed: boolean;
  createdAt: string;
}

export interface EventFilters {
  types?: string[];
  sources?: string[];
  correlationId?: string;
  startTime?: string;
  endTime?: string;
  processed?: boolean;
}

export class EventRepository extends BaseRepository<EventEntity> {
  constructor(db: Database) {
    super(db, 'events');
  }

  async create(entity: Omit<EventEntity, 'id' | 'createdAt'>): Promise<EventEntity> {
    const id = ulid();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, type, source, source_type, source_id, timestamp, received_at,
        correlation_id, data, raw_payload, metadata, processed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entity.type,
      entity.source,
      entity.sourceType,
      entity.sourceId,
      entity.timestamp,
      entity.receivedAt,
      entity.correlationId ?? null,
      this.toJSON(entity.data),
      this.toJSON(entity.rawPayload),
      entity.metadata ? this.toJSON(entity.metadata) : null,
      entity.processed ? 1 : 0,
      createdAt
    );

    return { ...entity, id, createdAt, correlationId: entity.correlationId };
  }

  async findById(id: string): Promise<EventEntity | null> {
    const row = this.db.prepare(`
      SELECT * FROM events WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: Partial<EventEntity>): Promise<boolean> {
    const allowedFields = ['processed'];
    const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fieldsToUpdate.length === 0) return false;

    const setClause = fieldsToUpdate.map(field => 
      `${this.fieldName(field)} = ?`
    ).join(', ');

    const stmt = this.db.prepare(`
      UPDATE events SET ${setClause} WHERE id = ?
    `);

    const values = fieldsToUpdate.map(field => {
      const value = updates[field as keyof EventEntity];
      return field === 'processed' ? (value ? 1 : 0) : value;
    });

    const result = stmt.run(...values, id);
    return result.changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM events WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async list(options?: ListOptions & EventFilters): Promise<EventEntity[]> {
    let query = 'SELECT * FROM events WHERE 1=1';
    const params: unknown[] = [];

    if (options?.types && options.types.length > 0) {
      query += ` AND type IN (${options.types.map(() => '?').join(',')})`;
      params.push(...options.types);
    }

    if (options?.sources && options.sources.length > 0) {
      query += ` AND source IN (${options.sources.map(() => '?').join(',')})`;
      params.push(...options.sources);
    }

    if (options?.correlationId) {
      query += ' AND correlation_id = ?';
      params.push(options.correlationId);
    }

    if (options?.startTime) {
      query += ' AND timestamp >= ?';
      params.push(options.startTime);
    }

    if (options?.endTime) {
      query += ' AND timestamp <= ?';
      params.push(options.endTime);
    }

    if (options?.processed !== undefined) {
      query += ' AND processed = ?';
      params.push(options.processed ? 1 : 0);
    }

    const orderBy = options?.orderBy ?? 'timestamp';
    const order = options?.order ?? 'DESC';
    query += ` ORDER BY ${orderBy} ${order}`;

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.mapRowToEntity(row));
  }

  async findUnprocessed(limit = 100): Promise<EventEntity[]> {
    return this.list({ processed: false, limit, orderBy: 'timestamp', order: 'ASC' });
  }

  private fieldName(field: string): string {
    const mapping: Record<string, string> = {
      sourceType: 'source_type',
      sourceId: 'source_id',
      correlationId: 'correlation_id',
      rawPayload: 'raw_payload',
      processed: 'processed',
      createdAt: 'created_at',
      receivedAt: 'received_at',
    };
    return mapping[field] ?? field;
  }

  private mapRowToEntity(row: Record<string, unknown>): EventEntity {
    return {
      id: row.id as string,
      type: row.type as string,
      source: row.source as string,
      sourceType: row.source_type as string,
      sourceId: row.source_id as string,
      timestamp: row.timestamp as string,
      receivedAt: row.received_at as string,
      correlationId: row.correlation_id as string | undefined,
      data: this.parseJSON<Record<string, unknown>>(row.data as string) ?? {},
      rawPayload: this.parseJSON<unknown>(row.raw_payload as string),
      metadata: this.parseJSON<Record<string, unknown>>(row.metadata as string),
      processed: (row.processed as number) === 1,
      createdAt: row.created_at as string,
    };
  }
}
```

Create `src/storage/repositories/sources.ts`:
```typescript
import { Database } from 'better-sqlite3';
import { BaseRepository, ListOptions } from './base.js';
import { ulid } from 'ulid';

export interface WebhookSourceEntity {
  id: string;
  name: string;
  sourceType: string;
  endpointUrl: string;
  signingSecret: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class SourceRepository extends BaseRepository<WebhookSourceEntity> {
  constructor(db: Database) {
    super(db, 'webhook_sources');
  }

  async create(entity: Omit<WebhookSourceEntity, 'id' | 'createdAt'>): Promise<WebhookSourceEntity> {
    const id = ulid();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO webhook_sources (id, name, source_type, endpoint_url, signing_secret, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entity.name,
      entity.sourceType,
      entity.endpointUrl,
      entity.signingSecret,
      entity.isActive ? 1 : 0,
      createdAt,
      createdAt
    );

    return { ...entity, id, createdAt };
  }

  async findById(id: string): Promise<WebhookSourceEntity | null> {
    const row = this.db.prepare('SELECT * FROM webhook_sources WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRowToEntity(row);
  }

  async findByName(name: string): Promise<WebhookSourceEntity | null> {
    const row = this.db.prepare('SELECT * FROM webhook_sources WHERE name = ?').get(name) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRowToEntity(row);
  }

  async findBySourceType(sourceType: string): Promise<WebhookSourceEntity[]> {
    const rows = this.db.prepare('SELECT * FROM webhook_sources WHERE source_type = ? AND is_active = 1').all(sourceType) as Record<string, unknown>[];
    return rows.map(row => this.mapRowToEntity(row));
  }

  async update(id: string, updates: Partial<WebhookSourceEntity>): Promise<boolean> {
    const allowedFields = ['name', 'endpointUrl', 'signingSecret', 'isActive'];
    const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
    if (fieldsToUpdate.length === 0) return false;

    const setClause = fieldsToUpdate.map(field => `${this.fieldName(field)} = ?`).join(', ');
    const stmt = this.db.prepare(`UPDATE webhook_sources SET ${setClause}, updated_at = datetime('now') WHERE id = ?`);

    const values = fieldsToUpdate.map(field => {
      const value = updates[field as keyof WebhookSourceEntity];
      if (field === 'signingSecret') return value ? this.toJSON(value) : null;
      if (field === 'isActive') return value ? 1 : 0;
      return value ?? null;
    });

    const result = stmt.run(...values, id);
    return result.changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM webhook_sources WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async list(options?: ListOptions): Promise<WebhookSourceEntity[]> {
    let query = 'SELECT * FROM webhook_sources WHERE 1=1';
    const params: unknown[] = [];
    if (options?.limit) { query += ' LIMIT ?'; params.push(options.limit); }
    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.mapRowToEntity(row));
  }

  private fieldName(field: string): string {
    const mapping: Record<string, string> = {
      sourceType: 'source_type',
      endpointUrl: 'endpoint_url',
      signingSecret: 'signing_secret',
      isActive: 'is_active',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    };
    return mapping[field] ?? field;
  }

  private mapRowToEntity(row: Record<string, unknown>): WebhookSourceEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      sourceType: row.source_type as string,
      endpointUrl: row.endpoint_url as string,
      signingSecret: row.signing_secret as string,
      isActive: (row.is_active as number) === 1,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
```

Create `src/storage/repositories/subscriptions.ts`:
```typescript
import { Database } from 'better-sqlite3';
import { BaseRepository, ListOptions } from './base.js';
import { ulid } from 'ulid';

export interface SubscriptionEntity {
  id: string;
  eventTypes: string[];
  filters?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
  lastPolledAt?: string;
}

export class SubscriptionRepository extends BaseRepository<SubscriptionEntity> {
  constructor(db: Database) {
    super(db, 'subscriptions');
  }

  async create(entity: Omit<SubscriptionEntity, 'id' | 'createdAt'>): Promise<SubscriptionEntity> {
    const id = ulid();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO subscriptions (id, event_types, filters, created_at, expires_at, is_active, last_polled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      this.toJSON(entity.eventTypes),
      entity.filters ? this.toJSON(entity.filters) : null,
      createdAt,
      entity.expiresAt ?? null,
      entity.isActive ? 1 : 0,
      entity.lastPolledAt ?? null
    );

    return { ...entity, id, createdAt };
  }

  async findById(id: string): Promise<SubscriptionEntity | null> {
    const row = this.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: Partial<SubscriptionEntity>): Promise<boolean> {
    const allowedFields = ['filters', 'expiresAt', 'isActive', 'lastPolledAt'];
    const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fieldsToUpdate.length === 0) return false;

    const setClause = fieldsToUpdate.map(field => `${this.fieldName(field)} = ?`).join(', ');
    const stmt = this.db.prepare(`UPDATE subscriptions SET ${setClause} WHERE id = ?`);

    const values = fieldsToUpdate.map(field => {
      const value = updates[field as keyof SubscriptionEntity];
      if (field === 'filters') return value ? this.toJSON(value) : null;
      if (field === 'isActive') return value ? 1 : 0;
      return value ?? null;
    });

    const result = stmt.run(...values, id);
    return result.changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM subscriptions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async list(options?: ListOptions): Promise<SubscriptionEntity[]> {
    let query = 'SELECT * FROM subscriptions WHERE 1=1';
    const params: unknown[] = [];

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.mapRowToEntity(row));
  }

  async findActive(): Promise<SubscriptionEntity[]> {
    const rows = this.db.prepare(`
      SELECT * FROM subscriptions 
      WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).all() as Record<string, unknown>[];
    
    return rows.map(row => this.mapRowToEntity(row));
  }

  async findByEventType(eventType: string): Promise<SubscriptionEntity[]> {
    const rows = this.db.prepare(`
      SELECT * FROM subscriptions 
      WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).all() as Record<string, unknown>[];

    // Filter by event type patterns in memory (wildcard matching)
    return rows.map(row => this.mapRowToEntity(row)).filter(entity => {
      return entity.eventTypes.some(pattern => this.matchEventType(pattern, eventType));
    });
  }

  private matchEventType(pattern: string, eventType: string): boolean {
    if (pattern === '*') return true;
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      return regex.test(eventType);
    }
    return pattern === eventType;
  }

  private fieldName(field: string): string {
    const mapping: Record<string, string> = {
      eventTypes: 'event_types',
      expiresAt: 'expires_at',
      isActive: 'is_active',
      lastPolledAt: 'last_polled_at',
    };
    return mapping[field] ?? field;
  }

  private mapRowToEntity(row: Record<string, unknown>): SubscriptionEntity {
    return {
      id: row.id as string,
      eventTypes: this.parseJSON<string[]>(row.event_types as string) ?? [],
      filters: this.parseJSON<Record<string, unknown>>(row.filters as string),
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string | undefined,
      isActive: (row.is_active as number) === 1,
      lastPolledAt: row.last_polled_at as string | undefined,
    };
  }
}
```

### 5. Database Service Integration

Create `src/storage/index.ts`:
```typescript
import { DatabaseService } from './database.js';
import { MigrationService } from './migrations.js';
import { EventRepository } from './repositories/events.js';
import { SubscriptionRepository } from './repositories/subscriptions.js';
import { SourceRepository } from './repositories/sources.js';

export class StorageService {
  private static instance: StorageService;
  private dbService: DatabaseService;
  private eventRepo: EventRepository | null = null;
  private subscriptionRepo: SubscriptionRepository | null = null;
  private sourceRepo: SourceRepository | null = null;

  private constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  async initialize(): Promise<void> {
    const db = this.dbService.connect();
    await MigrationService.run(db);
  }

  get events(): EventRepository {
    if (!this.eventRepo) {
      this.eventRepo = new EventRepository(this.dbService.getDatabase());
    }
    return this.eventRepo;
  }

  get subscriptions(): SubscriptionRepository {
    if (!this.subscriptionRepo) {
      this.subscriptionRepo = new SubscriptionRepository(this.dbService.getDatabase());
    }
    return this.subscriptionRepo;
  }

  get sources(): SourceRepository {
    if (!this.sourceRepo) {
      this.sourceRepo = new SourceRepository(this.dbService.getDatabase());
    }
    return this.sourceRepo;
  }

  async shutdown(): Promise<void> {
    this.dbService.close();
  }
}

export { DatabaseService } from './database.js';
export { EventRepository, EventEntity, EventFilters } from './repositories/events.js';
export { SubscriptionRepository, SubscriptionEntity } from './repositories/subscriptions.js';
export { SourceRepository, WebhookSourceEntity } from './repositories/sources.js';
```

## Best Practices

1. **Use WAL Mode**: Enables concurrent reads and writes
2. **Parameterized Queries**: Always use parameters to prevent SQL injection
3. **Transactions**: Wrap related operations in transactions
4. **Indexes**: Add indexes for all common query patterns
5. **Connection Management**: Use singleton pattern for database connection
6. **Error Handling**: Catch and log database errors appropriately
7. **Migration Versioning**: Track schema version in database
8. **JSON Storage**: Store complex data as JSON strings
9. **ULID for IDs**: Use ULID instead of UUID for better performance
10. **Regular Backups**: Implement automated backup strategy

## Related Skills

- **architecture-setup**: Foundation setup before database implementation
- **performance-optimization**: Advanced database optimization techniques
- **security-hardening**: Encryption for sensitive data at rest
- **deployment-automation**: Database backup and recovery in production

## Dependencies

This skill builds upon:
- Architecture setup (project structure, dependencies)
- TypeScript configuration
- Logging utilities

It enables:
- Webhook integration (storing events)
- MCP tools (querying events and subscriptions)
- All data persistence needs
