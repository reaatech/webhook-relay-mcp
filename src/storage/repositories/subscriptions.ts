import type Database from 'better-sqlite3';
import { BaseRepository, type ListOptions } from './base.js';
import { ulid } from 'ulid';
import { matchEventType } from '../../utils/patterns.js';

export interface SubscriptionEntity {
  id: string;
  eventTypes: string[];
  filters?: Record<string, unknown> | undefined;
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
  lastPolledAt?: string;
}

export class SubscriptionRepository extends BaseRepository<SubscriptionEntity> {
  constructor(db: Database.Database) {
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
    const row = this.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return this.mapRowToEntity(row);
  }

  async update(id: string, updates: Partial<SubscriptionEntity>): Promise<boolean> {
    const allowedFields = ['filters', 'expiresAt', 'isActive', 'lastPolledAt'];
    const fieldsToUpdate = Object.keys(updates).filter((key) => allowedFields.includes(key));

    if (fieldsToUpdate.length === 0) {
      return false;
    }

    const setClause = fieldsToUpdate.map((field) => `${this.fieldName(field)} = ?`).join(', ');
    const stmt = this.db.prepare(`UPDATE subscriptions SET ${setClause} WHERE id = ?`);

    const values = fieldsToUpdate.map((field) => {
      const value = updates[field as keyof SubscriptionEntity];
      if (field === 'filters') {
        return value ? this.toJSON(value) : null;
      }
      if (field === 'isActive') {
        return value ? 1 : 0;
      }
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
    return rows.map((row) => this.mapRowToEntity(row));
  }

  async findActive(): Promise<SubscriptionEntity[]> {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM subscriptions
        WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
      `
      )
      .all() as Record<string, unknown>[];

    return rows.map((row) => this.mapRowToEntity(row));
  }

  async findByEventType(eventType: string): Promise<SubscriptionEntity[]> {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM subscriptions
        WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
      `
      )
      .all() as Record<string, unknown>[];

    return rows
      .map((row) => this.mapRowToEntity(row))
      .filter((entity) => {
        return entity.eventTypes.some((pattern) => matchEventType(pattern, eventType));
      });
  }

  async markDelivered(subscriptionId: string, eventIds: string[]): Promise<void> {
    const deliveredAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO subscription_events (id, subscription_id, event_id, delivered_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const eventId of eventIds) {
      const id = ulid();
      stmt.run(id, subscriptionId, eventId, deliveredAt, deliveredAt);
    }
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
      filters: this.parseJSON<Record<string, unknown>>(row.filters as string) ?? undefined,
      createdAt: row.created_at as string,
      expiresAt: (row.expires_at as string) ?? undefined,
      isActive: (row.is_active as number) === 1,
      lastPolledAt: (row.last_polled_at as string) ?? undefined,
    };
  }
}
