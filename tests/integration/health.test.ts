import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server.js';
import { StorageService } from '../../src/storage/index.js';

describe('Health Endpoint', () => {
  const app = createApp();

  it('should return 200 and status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('0.1.0');
  });

  it('should return 200 and status ready', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.version).toBe('0.1.0');
  });
});

describe('Admin Cleanup Endpoint', () => {
  const app = createApp();

  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
  });

  it('should return 200 with cleanup results', async () => {
    const res = await request(app).post('/admin/cleanup');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(typeof res.body.deletedEvents).toBe('number');
    expect(typeof res.body.deletedSubscriptionEvents).toBe('number');
  });
});
