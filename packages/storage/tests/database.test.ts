import { DatabaseService } from '@reaatech/webhook-relay-storage';
import { describe, expect, it } from 'vitest';

describe('DatabaseService', () => {
  it('getInstance returns singleton', () => {
    const a = DatabaseService.getInstance();
    const b = DatabaseService.getInstance();
    expect(a).toBe(b);
  });

  it('connect creates and returns database', () => {
    const svc = DatabaseService.getInstance();
    const db = svc.connect();
    expect(db).toBeDefined();
    const result = db.prepare('SELECT 1 as v').get() as { v: number };
    expect(result.v).toBe(1);
  });

  it('connect returns same database on multiple calls', () => {
    const svc = DatabaseService.getInstance();
    const db1 = svc.connect();
    const db2 = svc.connect();
    expect(db1).toBe(db2);
  });

  it('getDatabase returns database after connect', () => {
    const svc = DatabaseService.getInstance();
    svc.connect();
    const db = svc.getDatabase();
    expect(db).toBeDefined();
    expect(db.prepare('SELECT 1 as v').get()).toEqual({ v: 1 });
  });

  it('close works and allows reconnection', () => {
    const svc = DatabaseService.getInstance();
    svc.connect();
    svc.close();
    const db = svc.connect();
    expect(db).toBeDefined();
    expect(db.prepare('SELECT 1 as v').get()).toEqual({ v: 1 });
  });

  it('getDatabase throws when not connected after close', () => {
    const svc = DatabaseService.getInstance();
    svc.close();
    expect(() => svc.getDatabase()).toThrow('Database not connected');
  });
});
