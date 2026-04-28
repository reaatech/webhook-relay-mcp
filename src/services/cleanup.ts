import { DatabaseService } from '../storage/index.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class CleanupService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  start(): void {
    if (this.intervalId) {
      return;
    }

    logger.info({ intervalMs: DEFAULT_INTERVAL_MS }, 'Starting cleanup service');
    this.intervalId = setInterval(() => {
      this.runCleanup().catch((err) => {
        logger.error({ err, event: 'cleanup_error' }, 'Scheduled cleanup failed');
      });
    }, DEFAULT_INTERVAL_MS);

    // Run immediately on start
    this.runCleanup().catch((err) => {
      logger.error({ err, event: 'cleanup_error' }, 'Initial cleanup failed');
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info({}, 'Cleanup service stopped');
    }
  }

  async runCleanup(): Promise<{ deletedEvents: number; deletedSubscriptionEvents: number }> {
    if (this.isRunning) {
      logger.warn({ event: 'cleanup_skipped' }, 'Cleanup already in progress, skipping');
      return { deletedEvents: 0, deletedSubscriptionEvents: 0 };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const db = DatabaseService.getInstance().getDatabase();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.eventRetentionDays);
      const cutoffIso = cutoffDate.toISOString();

      // Delete old subscription_events first (foreign key cascade would handle this,
      // but explicit deletion gives us accurate counts)
      const subEventsResult = db
        .prepare(
          `DELETE FROM subscription_events WHERE event_id IN (
          SELECT id FROM events WHERE received_at < ?
        )`
        )
        .run(cutoffIso);

      const eventsResult = db.prepare('DELETE FROM events WHERE received_at < ?').run(cutoffIso);

      const durationMs = Date.now() - startTime;

      logger.info(
        {
          event: 'cleanup_completed',
          deletedEvents: eventsResult.changes,
          deletedSubscriptionEvents: subEventsResult.changes,
          retentionDays: config.eventRetentionDays,
          cutoffDate: cutoffIso,
          durationMs,
        },
        'Cleanup completed'
      );

      return {
        deletedEvents: eventsResult.changes,
        deletedSubscriptionEvents: subEventsResult.changes,
      };
    } catch (error) {
      logger.error({ error, event: 'cleanup_error' }, 'Cleanup failed');
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}
