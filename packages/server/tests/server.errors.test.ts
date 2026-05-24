import { config } from '@reaatech/webhook-relay-core';
import { CleanupService } from '@reaatech/webhook-relay-storage';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server.js';

describe('GET /metrics error path', () => {
  const app = createApp();

  it('returns 500 when database is not connected', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(500);
    expect(res.text).toBe('Internal server error');
  });
});

describe('POST /admin/cleanup error path', () => {
  beforeAll(() => {
    vi.spyOn(CleanupService.prototype, 'runCleanup').mockRejectedValue(new Error('Database error'));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const app = createApp();

  it('returns 500 when cleanup fails', async () => {
    const res = await request(app).post('/admin/cleanup');
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toBe('Cleanup failed');
  });
});

describe('POST /admin/cleanup production guard', () => {
  const origEnv = config.nodeEnv;
  const origKey = config.adminApiKey;

  beforeAll(() => {
    (config as Record<string, unknown>).nodeEnv = 'production';
    (config as Record<string, unknown>).adminApiKey = undefined;
  });

  afterAll(() => {
    config.nodeEnv = origEnv;
    config.adminApiKey = origKey;
  });

  const app = createApp();

  it('returns 403 in production without ADMIN_API_KEY', async () => {
    const res = await request(app).post('/admin/cleanup');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('ADMIN_API_KEY');
  });
});
