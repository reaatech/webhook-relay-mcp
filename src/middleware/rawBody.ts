import type { Request, Response, NextFunction } from 'express';
import getRawBody from 'raw-body';

export async function rawBodyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.path.startsWith('/webhooks/')) {
    return next();
  }

  try {
    const rawBody = await getRawBody(req, {
      length: req.headers['content-length'] ? Number(req.headers['content-length']) : null,
      limit: '1mb',
    });

    (req as Request & { rawBody: Buffer }).rawBody = rawBody;

    if (req.headers['content-type']?.includes('application/json')) {
      req.body = JSON.parse(rawBody.toString('utf-8'));
    } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      req.body = Object.fromEntries(new globalThis.URLSearchParams(rawBody.toString('utf-8')));
    }

    next();
  } catch (error) {
    next(error);
  }
}
