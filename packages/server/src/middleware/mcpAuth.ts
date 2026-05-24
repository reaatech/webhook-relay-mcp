import { config } from '@reaatech/webhook-relay-core';
import type { NextFunction, Request, Response } from 'express';

const SKIP_AUTH_PATHS = ['/health', '/health/ready', '/metrics'];

export function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (config.mcpTransport === 'stdio') {
    next();
    return;
  }

  if (SKIP_AUTH_PATHS.some((p) => req.path === p)) {
    next();
    return;
  }

  if (!config.mcpApiKey) {
    next();
    return;
  }

  const apiKey =
    (req.headers['x-api-key'] as string | undefined) ??
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined);

  if (!apiKey) {
    res
      .status(401)
      .json({ error: 'Missing API key. Provide X-API-Key or Authorization: Bearer header.' });
    return;
  }

  if (apiKey !== config.mcpApiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
