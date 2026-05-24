import { logger } from '@reaatech/webhook-relay-core';
import type { NextFunction, Request, Response } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}

const store = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime <= now) {
      store.delete(key);
    }
  }
}, 60 * 1000);

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyGenerator = (req) => req.ip ?? 'unknown' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetTime <= now) {
      entry = { count: 1, resetTime: now + windowMs };
      store.set(key, entry);
      next();
      return;
    }

    entry.count++;

    if (entry.count > maxRequests) {
      logger.warn(
        { event: 'rate_limit_exceeded', key, count: entry.count, maxRequests },
        'Rate limit exceeded',
      );
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}
