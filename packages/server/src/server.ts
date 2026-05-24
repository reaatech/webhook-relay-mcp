import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@reaatech/webhook-relay-core';
import { logger } from '@reaatech/webhook-relay-core';
import { getMetricsText, registerMetric, setGauge } from '@reaatech/webhook-relay-core';
import { CleanupService } from '@reaatech/webhook-relay-storage';
import { DatabaseService } from '@reaatech/webhook-relay-storage';
import { setupMcpHttpRoutes } from '@reaatech/webhook-relay-tools';
import { webhookRouter } from '@reaatech/webhook-relay-webhooks';
import express from 'express';
import { setupDashboard } from './dashboard.js';
import { mcpAuthMiddleware } from './middleware/mcpAuth.js';
import { rawBodyMiddleware } from './middleware/rawBody.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));

const jsonParser = express.json({ limit: '1mb' });

export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);
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

  registerMetric('webhook_received_total', 'counter', 'Total webhooks received');
  registerMetric(
    'webhook_validation_failed_total',
    'counter',
    'Total webhook signature validation failures',
  );
  registerMetric('webhook_ingested_total', 'counter', 'Total webhooks successfully ingested');
  registerMetric('webhook_delivery_total', 'counter', 'Total webhook deliveries by status');
  registerMetric('webhook_poll_total', 'counter', 'Total poll requests');
  registerMetric('webhook_subscription_active', 'gauge', 'Number of active subscriptions');
  registerMetric(
    'webhook_events_pending',
    'gauge',
    'Number of events with delivery_status=pending',
  );

  app.get('/metrics', (_req, res) => {
    try {
      const db = DatabaseService.getInstance().getDatabase();
      try {
        const pendingRow = db
          .prepare("SELECT COUNT(*) as count FROM events WHERE delivery_status = 'pending'")
          .get() as { count: number } | undefined;
        setGauge('webhook_events_pending', pendingRow?.count ?? 0);
      } catch {
        setGauge('webhook_events_pending', 0);
      }

      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.status(200).send(getMetricsText());
    } catch (error) {
      logger.error({ error, event: 'metrics_error' }, 'Failed to serve metrics');
      res.status(500).send('Internal server error');
    }
  });

  app.use(mcpAuthMiddleware);

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

  setupDashboard(app);

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
      res.status(500).json({ error: 'Internal server error' });
    },
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
