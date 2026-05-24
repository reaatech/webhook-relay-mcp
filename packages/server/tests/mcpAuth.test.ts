import { config } from '@reaatech/webhook-relay-core';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mcpAuthMiddleware } from '../src/middleware/mcpAuth.js';
import { createApp } from '../src/server.js';

describe('mcpAuthMiddleware', () => {
  describe('when MCP_API_KEY is not set (SSE transport)', () => {
    beforeAll(() => {
      config.mcpTransport = 'sse';
    });

    afterAll(() => {
      config.mcpTransport = 'stdio';
    });

    const app = createApp();

    it('allows requests to any path', async () => {
      const res = await request(app).get('/api/some-path');
      expect(res.status).toBe(404);
    });
  });

  describe('when MCP_API_KEY is set', () => {
    let app: ReturnType<typeof createApp>;

    beforeAll(() => {
      config.mcpApiKey = 'test-api-key';
      config.mcpTransport = 'sse';
      app = createApp();
    });

    afterAll(() => {
      config.mcpApiKey = undefined;
      config.mcpTransport = 'stdio';
    });

    it('blocks requests without API key', async () => {
      const res = await request(app).get('/api/some-path');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('API key');
    });

    it('accepts valid X-API-Key header', async () => {
      const res = await request(app).get('/api/some-path').set('X-API-Key', 'test-api-key');
      expect(res.status).toBe(404);
    });

    it('accepts valid Authorization: Bearer header', async () => {
      const res = await request(app)
        .get('/api/some-path')
        .set('Authorization', 'Bearer test-api-key');
      expect(res.status).toBe(404);
    });

    it('rejects invalid API key via X-API-Key', async () => {
      const res = await request(app).get('/api/some-path').set('X-API-Key', 'wrong-key');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid API key');
    });

    it('rejects invalid API key via Authorization header', async () => {
      const res = await request(app).get('/api/some-path').set('Authorization', 'Bearer wrong-key');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid API key');
    });

    it('allows health endpoint without auth', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('allows health/ready endpoint without auth', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    it('allows metrics endpoint without auth', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).not.toBe(401);
    });

    it('directly calls next for skip paths in middleware', () => {
      const req = { path: '/health' } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn();
      mcpAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('directly calls next for metrics skip path', () => {
      const req = { path: '/metrics' } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn();
      mcpAuthMiddleware(req, res, next);
    });

    it('directly calls next for health/ready skip path', () => {
      const req = { path: '/health/ready' } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn();
      mcpAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
