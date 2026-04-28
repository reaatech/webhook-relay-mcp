import type Database from 'better-sqlite3';
import { BaseRepository, type ListOptions } from './base.js';
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
  constructor(db: Database.Database) {
    super(db, 'webhook_sources');
  }

  async create(
    entity: Omit<WebhookSourceEntity, 'id' | 'createdAt'>
  ): Promise<WebhookSourceEntity> {
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
    const row = this.db.prepare('SELECT * FROM webhook_sources WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return this.mapRowToEntity(row);
  }

  async findByName(name: string): Promise<WebhookSourceEntity | null> {
    const row = this.db.prepare('SELECT * FROM webhook_sources WHERE name = ?').get(name) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return this.mapRowToEntity(row);
  }

  async findBySourceType(sourceType: string): Promise<WebhookSourceEntity[]> {
    const rows = this.db
      .prepare('SELECT * FROM webhook_sources WHERE source_type = ? AND is_active = 1')
      .all(sourceType) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToEntity(row));
  }

  async update(id: string, updates: Partial<WebhookSourceEntity>): Promise<boolean> {
    const allowedFields = ['name', 'endpointUrl', 'signingSecret', 'isActive'];
    const fieldsToUpdate = Object.keys(updates).filter((key) => allowedFields.includes(key));

    if (fieldsToUpdate.length === 0) {
      return false;
    }

    const setClause = fieldsToUpdate.map((field) => `${this.fieldName(field)} = ?`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE webhook_sources SET ${setClause}, updated_at = datetime('now') WHERE id = ?`
    );

    const values = fieldsToUpdate.map((field) => {
      const value = updates[field as keyof WebhookSourceEntity];
      if (field === 'isActive') {
        return value ? 1 : 0;
      }
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
    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToEntity(row));
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
