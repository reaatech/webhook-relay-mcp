import type Database from 'better-sqlite3';

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
  protected db: Database.Database;
  protected tableName: string;

  constructor(db: Database.Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  abstract create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  abstract findById(id: ID): Promise<T | null>;
  abstract update(id: ID, updates: Partial<T>): Promise<boolean>;
  abstract delete(id: ID): Promise<boolean>;
  abstract list(options?: ListOptions): Promise<T[]>;

  protected parseJSON<T>(value: string | null): T | null {
    if (!value) {
      return null;
    }
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
