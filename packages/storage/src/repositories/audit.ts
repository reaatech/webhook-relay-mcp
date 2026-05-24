import type Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { BaseRepository, type ListOptions } from './base.js';

export interface AuditEntity {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown> | undefined;
  createdAt: string;
}

export interface AuditListOptions extends ListOptions {
  actor?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startTime?: string;
  endTime?: string;
}

export class AuditRepository extends BaseRepository<AuditEntity> {
  constructor(db: Database.Database) {
    super(db, 'audit_log');
  }

  async create(entity: Omit<AuditEntity, 'id' | 'createdAt'>): Promise<AuditEntity> {
    const id = ulid();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO audit_log (id, actor, action, resource_type, resource_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entity.actor,
      entity.action,
      entity.resourceType,
      entity.resourceId,
      entity.details ? this.toJSON(entity.details) : null,
      createdAt,
    );

    return { ...entity, id, createdAt };
  }

  async findById(id: string): Promise<AuditEntity | null> {
    const row = this.db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return this.mapRowToEntity(row);
  }

  async update(): Promise<boolean> {
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM audit_log WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async list(options?: AuditListOptions): Promise<AuditEntity[]> {
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: unknown[] = [];

    if (options?.actor) {
      query += ' AND actor = ?';
      params.push(options.actor);
    }

    if (options?.action) {
      query += ' AND action = ?';
      params.push(options.action);
    }

    if (options?.resourceType) {
      query += ' AND resource_type = ?';
      params.push(options.resourceType);
    }

    if (options?.resourceId) {
      query += ' AND resource_id = ?';
      params.push(options.resourceId);
    }

    if (options?.startTime) {
      query += ' AND created_at >= ?';
      params.push(options.startTime);
    }

    if (options?.endTime) {
      query += ' AND created_at <= ?';
      params.push(options.endTime);
    }

    const order = options?.order === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY created_at ${order}`;

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

  private mapRowToEntity(row: Record<string, unknown>): AuditEntity {
    return {
      id: row.id as string,
      actor: row.actor as string,
      action: row.action as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      details: this.parseJSON<Record<string, unknown>>(row.details as string) ?? undefined,
      createdAt: row.created_at as string,
    };
  }
}
