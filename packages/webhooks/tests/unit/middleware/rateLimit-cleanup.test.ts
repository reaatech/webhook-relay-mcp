import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type RateLimitMiddleware = (opts: {
  windowMs: number;
  maxRequests: number;
}) => import('express').RequestHandler;

let rateLimit: RateLimitMiddleware;

beforeAll(async () => {
  vi.useFakeTimers();
  const mod = await import('@reaatech/webhook-relay-webhooks');
  rateLimit = mod.rateLimit;
});

afterAll(() => {
  vi.useRealTimers();
});

describe('rateLimit cleanup interval', () => {
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

  it('should remove expired entries after cleanup interval', () => {
    const ip = 'cleanup-test-1';
    const middleware = rateLimit({ windowMs: 1000, maxRequests: 1 });
    const { req, res } = createMockReqRes(ip);
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);

    vi.advanceTimersByTime(61000);

    const next2 = vi.fn() as NextFunction;
    const { res: res2 } = createMockReqRes(ip);
    middleware(req, res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it('should not remove non-expired entries during cleanup', () => {
    const ip1 = 'cleanup-test-not-expired-1';
    const ip2 = 'cleanup-test-not-expired-2';
    const shortMiddleware = rateLimit({ windowMs: 100, maxRequests: 5 });
    const longMiddleware = rateLimit({ windowMs: 120000, maxRequests: 5 });
    const next = vi.fn() as NextFunction;

    shortMiddleware(createMockReqRes(ip1).req, createMockReqRes(ip1).res, next);
    longMiddleware(createMockReqRes(ip2).req, createMockReqRes(ip2).res, next);

    vi.advanceTimersByTime(61000);

    const next3 = vi.fn() as NextFunction;
    shortMiddleware(createMockReqRes(ip1).req, createMockReqRes(ip1).res, next3);
    expect(next3).toHaveBeenCalledTimes(1);
  });
});
