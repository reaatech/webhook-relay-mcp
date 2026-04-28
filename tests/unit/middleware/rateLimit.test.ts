import { describe, it, expect } from 'vitest';
import { rateLimit } from '../../../src/middleware/rateLimit.js';
import type { Request, Response } from 'express';

interface MockResponse extends Response {
  statusCode: number;
  jsonBody: unknown;
}

describe('rateLimit middleware', () => {
  function createReq(ip: string): Request {
    return { ip } as Request;
  }

  function createRes(): MockResponse {
    const res = {
      statusCode: 200,
      jsonBody: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.jsonBody = body;
        return this;
      },
    };
    return res as unknown as MockResponse;
  }

  it('should allow requests within limit', () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 2 });
    const req = createReq('1.2.3.4');
    const res = createRes();
    const next = () => {
      /* no-op */
    };

    middleware(req, res, next);
    expect(res.statusCode).toBe(200);

    middleware(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it('should block requests over limit', () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const req = createReq('5.6.7.8');
    const res = createRes();
    const next = () => {
      /* no-op */
    };

    middleware(req, res, next);
    expect(res.statusCode).toBe(200);

    middleware(req, res, next);
    expect(res.statusCode).toBe(429);
    expect(res.jsonBody).toMatchObject({ error: 'Too many requests' });
  });

  it('should track different IPs separately', () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const res = createRes();
    const next = () => {
      /* no-op */
    };

    middleware(createReq('9.10.11.12'), res, next);
    expect(res.statusCode).toBe(200);

    const res2 = createRes();
    middleware(createReq('13.14.15.16'), res2, next);
    expect(res2.statusCode).toBe(200);
  });
});
