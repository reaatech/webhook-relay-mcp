import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Server } from 'http';
import express from 'express';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { rawBodyMiddleware } from './middleware/rawBody.js';
import { webhookRouter } from './webhooks/ingest.js';
import { CleanupService } from './services/cleanup.js';
import { setupMcpHttpRoutes } from './mcp/index.js';
import { DatabaseService } from './storage/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const jsonParser = express.json({ limit: '1mb' });

export function createApp(): express.Application {
  const app = express();

  app.use(rawBodyMiddleware);
  app.use((req, res, next) => {
    if (req.path.startsWith('/webhooks/')) {
      return next();
    }
    return jsonParser(req, res, next);
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', version: pkg.version });
  });

  app.get('/health/ready', (_req, res) => {
    res.status(200).json({ status: 'ready', version: pkg.version });
  });

  app.post('/admin/cleanup', async (req, res) => {
    if (!config.adminApiKey && config.nodeEnv === 'production') {
      res.status(403).json({
        error: 'ADMIN_API_KEY must be configured in production to access this endpoint',
      });
      return;
    }
    if (config.adminApiKey) {
      const authHeader = req.headers.authorization;
      const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      if (providedKey !== config.adminApiKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    try {
      const cleanup = new CleanupService();
      const result = await cleanup.runCleanup();
      res.status(200).json({ status: 'completed', ...result });
    } catch (error) {
      logger.error({ error, event: 'admin_cleanup_error' }, 'Admin cleanup failed');
      res.status(500).json({ status: 'error', message: 'Cleanup failed' });
    }
  });

  app.use('/webhooks', webhookRouter);

  setupMcpHttpRoutes(app);

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
      res.status(500).json({ error: 'Internal server error' });
    }
  );

  return app;
}

let httpServer: Server | null = null;
let cleanupService: CleanupService | null = null;

function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing gracefully...');

  if (cleanupService) {
    cleanupService.stop();
  }

  if (httpServer) {
    httpServer.close(() => {
      logger.info({}, 'HTTP server closed');
      try {
        DatabaseService.getInstance().close();
      } catch {
        // database may not be initialized
      }
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn({}, 'Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    try {
      DatabaseService.getInstance().close();
    } catch {
      // database may not be initialized
    }
    process.exit(0);
  }
}

export function startHttpServer(): void {
  const app = createApp();
  cleanupService = new CleanupService();
  cleanupService.start();

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  httpServer = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host }, 'HTTP server started');
  });
}
