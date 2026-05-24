import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@reaatech/webhook-relay-storage', () => {
  const mockDb = {
    prepare: vi.fn(() => {
      throw new Error('table not found');
    }),
  };
  return {
    DatabaseService: {
      getInstance: vi.fn(() => ({
        getDatabase: vi.fn(() => mockDb),
      })),
    },
  };
});

describe('GET /metrics inner catch', () => {
  it('handles query failure in inner try block', async () => {
    const { createApp } = await import('../src/server.js');
    const app = createApp();
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });
});
