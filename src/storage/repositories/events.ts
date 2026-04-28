import type Database from 'better-sqlite3';
import { BaseRepository, type ListOptions } from './base.js';
import { ulid } from 'ulid';

export interface EventEntity {
  id: string;
  type: string;
  source: string;
  sourceType: string;
  sourceId: string;
  webhookId: string | null;
  timestamp: string;
  receivedAt: string;
  correlationId?: string | undefined;
  data: Record<string, unknown>;
  rawPayload: unknown;
  metadata?: Record<string, unknown> | undefined;
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
  cursorTimestamp?: string;
  cursorId?: string;
}

export class EventRepository extends BaseRepository<EventEntity> {
  constructor(db: Database.Database) {
    super(db, 'events');
  }

  async create(entity: Omit<EventEntity, 'id' | 'createdAt'>): Promise<EventEntity> {
    const id = ulid();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, type, source, source_type, source_id, webhook_id, timestamp, received_at,
        correlation_id, data, raw_payload, metadata, processed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entity.type,
      entity.source,
      entity.sourceType,
      entity.sourceId,
      entity.webhookId ?? null,
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
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return null;
    }
    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: Partial<EventEntity>): Promise<boolean> {
    const allowedFields = ['processed'];
    const fieldsToUpdate = Object.keys(updates).filter((key) => allowedFields.includes(key));

    if (fieldsToUpdate.length === 0) {
      return false;
    }

    const setClause = fieldsToUpdate.map((field) => `${this.fieldName(field)} = ?`).join(', ');
    const stmt = this.db.prepare(`UPDATE events SET ${setClause} WHERE id = ?`);

    const values = fieldsToUpdate.map((field) => {
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

    if (options?.cursorTimestamp && options?.cursorId) {
      query += ' AND (timestamp < ? OR (timestamp = ? AND id < ?))';
      params.push(options.cursorTimestamp, options.cursorTimestamp, options.cursorId);
    }

    const allowedOrderBy = ['timestamp', 'received_at', 'created_at', 'type', 'source'];
    const orderBy = allowedOrderBy.includes(options?.orderBy ?? '')
      ? options?.orderBy
      : 'timestamp';
    const order = options?.order === 'ASC' ? 'ASC' : 'DESC';
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
    return rows.map((row) => this.mapRowToEntity(row));
  }

  async findUnprocessed(limit = 100): Promise<EventEntity[]> {
    return this.list({ processed: false, limit, orderBy: 'timestamp', order: 'ASC' });
  }

  async findByWebhookId(source: string, webhookId: string): Promise<EventEntity | null> {
    const row = this.db
      .prepare('SELECT * FROM events WHERE source = ? AND webhook_id = ?')
      .get(source, webhookId) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }
    return this.mapRowToEntity(row);
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
      webhookId: (row.webhook_id as string) ?? null,
      timestamp: row.timestamp as string,
      receivedAt: row.received_at as string,
      correlationId: row.correlation_id as string | undefined,
      data: this.parseJSON<Record<string, unknown>>(row.data as string) ?? {},
      rawPayload: this.parseJSON<unknown>(row.raw_payload as string),
      metadata: this.parseJSON<Record<string, unknown>>(row.metadata as string) ?? undefined,
      processed: (row.processed as number) === 1,
      createdAt: row.created_at as string,
    };
  }
}
