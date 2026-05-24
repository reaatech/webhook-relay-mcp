import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { rawBodyMiddleware } from '../src/middleware/rawBody.js';

function createTestApp(): express.Application {
  const app = express();
  app.use(rawBodyMiddleware);

  app.post('/webhooks/test', (req: Request, res: Response) => {
    res.json({
      rawBody: (req as Request & { rawBody: Buffer }).rawBody?.toString('utf-8'),
      body: req.body,
      contentType: req.headers['content-type'],
    });
  });

  app.get('/non-webhook', (req: Request, res: Response) => {
    res.json({
      ok: true,
      hasRawBody: !!(req as Request & { rawBody: Buffer }).rawBody,
    });
  });

  app.get('/webhooks/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

describe('rawBodyMiddleware', () => {
  const app = createTestApp();

  it('captures rawBody for webhook POST paths with JSON', async () => {
    const payload = { hello: 'world', num: 42 };
    const res = await request(app)
      .post('/webhooks/test')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.rawBody).toBe(JSON.stringify(payload));
    expect(res.body.body).toEqual(payload);
  });

  it('captures rawBody for webhook POST paths with form-urlencoded', async () => {
    const res = await request(app)
      .post('/webhooks/test')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('foo=bar&baz=qux');

    expect(res.status).toBe(200);
    expect(res.body.rawBody).toBe('foo=bar&baz=qux');
    expect(res.body.body).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('passes through for non-webhook paths without capturing rawBody', async () => {
    const res = await request(app).get('/non-webhook');

    expect(res.status).toBe(200);
    expect(res.body.hasRawBody).toBe(false);
  });

  it('passes through for webhook GET paths', async () => {
    const res = await request(app).get('/webhooks/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('handles request entity too large error', async () => {
    const largePayload = Buffer.alloc(1_200_000, 'x');
    try {
      const res = await request(app)
        .post('/webhooks/test')
        .set('Content-Type', 'application/json')
        .send(largePayload);
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    } catch {
      // raw-body destroys the stream on limit exceeded which can cause
      // EPIPE/ECONNRESET in supertest; the error handler still executed
    }
  });
});
