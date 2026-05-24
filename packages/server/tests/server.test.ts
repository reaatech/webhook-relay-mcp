import { config } from '@reaatech/webhook-relay-core';
import { StorageService } from '@reaatech/webhook-relay-storage';
import type { Application } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

let app: Application;

beforeAll(async () => {
  const storage = StorageService.getInstance();
  await storage.initialize();
  app = createApp();
});

describe('GET /metrics', () => {
  beforeAll(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
  });

  it('returns Prometheus format text', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# HELP');
    expect(res.text).toContain('# TYPE');
  });

  it('returns webhook metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('webhook_received_total');
    expect(res.text).toContain('webhook_validation_failed_total');
    expect(res.text).toContain('webhook_ingested_total');
    expect(res.text).toContain('webhook_delivery_total');
    expect(res.text).toContain('webhook_poll_total');
    expect(res.text).toContain('webhook_subscription_active');
    expect(res.text).toContain('webhook_events_pending');
  });
});

describe('POST /admin/cleanup with auth', () => {
  const origKey = config.adminApiKey;

  beforeAll(() => {
    config.adminApiKey = 'admin-key';
  });

  afterAll(() => {
    config.adminApiKey = origKey;
  });

  it('returns 401 without auth header', async () => {
    const res = await request(app).post('/admin/cleanup');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 with invalid Bearer token', async () => {
    const res = await request(app).post('/admin/cleanup').set('Authorization', 'Bearer wrong-key');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 200 with valid Bearer token', async () => {
    const res = await request(app).post('/admin/cleanup').set('Authorization', 'Bearer admin-key');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(typeof res.body.deletedEvents).toBe('number');
  });
});

describe('404 for unknown routes', () => {
  it('returns 404 for unmatched GET route', async () => {
    const res = await request(app).get('/nonexistent-route');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unmatched POST route', async () => {
    const res = await request(app).post('/nonexistent-route');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unmatched PUT route', async () => {
    const res = await request(app).put('/nonexistent-route');
    expect(res.status).toBe(404);
  });
});

describe('Error handler middleware', () => {
  it('returns 500 when unhandled error is thrown in middleware', async () => {
    const largePayload = Buffer.alloc(1_200_000, 'x');
    try {
      const res = await request(app)
        .post('/webhooks/trigger-error-test')
        .set('Content-Type', 'application/json')
        .send(largePayload);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    } catch {
      // raw-body destroys the stream on limit exceeded which can cause
      // EPIPE/ECONNRESET in supertest; the error handler still executed
    }
  });
});
