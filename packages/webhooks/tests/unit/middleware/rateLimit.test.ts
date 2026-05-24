import { rateLimit } from '@reaatech/webhook-relay-webhooks';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockReqRes(ip = '127.0.0.1') {
  const req = { ip, headers: {} } as unknown as Request;

  let statusCode = 200;
  let jsonBody: unknown;

  const res = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      jsonBody = body;
      return res;
    }),
    _getStatus: () => statusCode,
    _getJson: () => jsonBody,
  } as unknown as Response & { _getStatus: () => number; _getJson: () => unknown };

  return { req, res };
}

let counter = 0;
function uniqueIP(): string {
  counter++;
  return `rate-test-${counter}-${Date.now()}`;
}

describe('rateLimit middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should accept requests within the limit', () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 3 });
    const { req, res } = createMockReqRes(uniqueIP());
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should accept requests up to the limit for same IP', () => {
    const ip = uniqueIP();
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 2 });
    const { req: req1, res: res1 } = createMockReqRes(ip);
    const next1 = vi.fn() as NextFunction;
    const next2 = vi.fn() as NextFunction;

    middleware(req1, res1, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    middleware(req1, res1, next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it('should reject requests over the limit', () => {
    const ip = uniqueIP();
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const { req, res } = createMockReqRes(ip);
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Too many requests' }));
  });

  it('should include retryAfter in rate limit response', () => {
    const ip = uniqueIP();
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const { req, res } = createMockReqRes(ip);
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    middleware(req, res, next);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(jsonCall).toHaveProperty('retryAfter');
    expect(typeof jsonCall.retryAfter).toBe('number');
    expect(jsonCall.retryAfter).toBeGreaterThan(0);
  });

  it('should reset the counter after the window expires', async () => {
    const ip = uniqueIP();
    const middleware = rateLimit({ windowMs: 50, maxRequests: 1 });
    const { req, res } = createMockReqRes(ip);
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);

    await new Promise((r) => setTimeout(r, 60));

    const next2 = vi.fn() as NextFunction;
    const res2 = createMockReqRes().res;
    middleware(req, res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);
  }, 10000);

  it('should give different IPs separate counters', () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });

    const ip1 = uniqueIP();
    const ip2 = uniqueIP();
    const { req: req1, res: res1 } = createMockReqRes(ip1);
    const { req: req2, res: res2 } = createMockReqRes(ip2);
    const next = vi.fn() as NextFunction;

    middleware(req1, res1, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(req2, res2, next);
    expect(next).toHaveBeenCalledTimes(2);

    middleware(req1, res1, next);
    expect(res1.status).toHaveBeenCalledWith(429);
  });

  it('should use custom key generator when provided', () => {
    const ip = uniqueIP();
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      keyGenerator: (req) => `custom-${req.ip}`,
    });

    const { req, res } = createMockReqRes(ip);
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('should use unknown when req.ip is undefined', () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const { req, res } = createMockReqRes();
    Object.defineProperty(req, 'ip', { value: undefined });
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
