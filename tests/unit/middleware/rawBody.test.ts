import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock raw-body module
vi.mock('raw-body', () => ({
  default: vi.fn(),
}));

import getRawBody from 'raw-body';
import { rawBodyMiddleware } from '../../../src/middleware/rawBody.js';

describe('rawBodyMiddleware', () => {
  it('should capture raw body for webhooks', async () => {
    const bodyData = Buffer.from(JSON.stringify({ test: true }));
    vi.mocked(getRawBody).mockResolvedValue(bodyData);

    const req = {
      path: '/webhooks/test',
      headers: { 'content-length': String(bodyData.length), 'content-type': 'application/json' },
    } as unknown as Request;

    const res = {} as Response;
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    await rawBodyMiddleware(req, res, next);
    expect(nextCalled).toBe(true);
    expect((req as Request & { rawBody: Buffer }).rawBody).toEqual(bodyData);
  });

  it('should parse url-encoded body', async () => {
    const bodyData = Buffer.from('key=value&foo=bar');
    vi.mocked(getRawBody).mockResolvedValue(bodyData);

    const req = {
      path: '/webhooks/test',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = () => {
      /* no-op */
    };

    await rawBodyMiddleware(req, res, next);
    expect(req.body).toEqual({ key: 'value', foo: 'bar' });
  });

  it('should skip non-webhook routes', async () => {
    const req = { path: '/health' } as unknown as Request;
    const res = {} as Response;
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    await rawBodyMiddleware(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('should call next with error on failure', async () => {
    vi.mocked(getRawBody).mockRejectedValue(new Error('stream error'));

    const req = {
      path: '/webhooks/test',
      headers: {},
    } as unknown as Request;

    const res = {} as Response;
    let error: Error | null = null;
    const next: NextFunction = (err) => {
      error = err as Error;
    };

    await rawBodyMiddleware(req, res, next);
    expect(error).not.toBeNull();
    expect((error as unknown as Error).message).toBe('stream error');
  });
});
