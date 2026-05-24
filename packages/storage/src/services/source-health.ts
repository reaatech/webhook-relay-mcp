import { config } from '@reaatech/webhook-relay-core';
import { DatabaseService } from '../database.js';

export interface SourceHealth {
  name: string;
  lastEventAt: string | null;
  isHealthy: boolean;
}

export class SourceHealthService {
  private static instance: SourceHealthService;

  static getInstance(): SourceHealthService {
    if (!SourceHealthService.instance) {
      SourceHealthService.instance = new SourceHealthService();
    }
    return SourceHealthService.instance;
  }

  async recordEvent(name: string): Promise<void> {
    const db = DatabaseService.getInstance().getDatabase();
    const now = new Date().toISOString();

    db.prepare('UPDATE webhook_sources SET last_event_at = ?, updated_at = ? WHERE name = ?').run(
      now,
      now,
      name,
    );
  }

  async getHealth(name: string): Promise<SourceHealth | null> {
    const db = DatabaseService.getInstance().getDatabase();
    const row = db
      .prepare('SELECT name, last_event_at FROM webhook_sources WHERE name = ?')
      .get(name) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return this.computeHealth(row.name as string, row.last_event_at as string | null);
  }

  async checkAllSources(): Promise<SourceHealth[]> {
    const db = DatabaseService.getInstance().getDatabase();
    const rows = db.prepare('SELECT name, last_event_at FROM webhook_sources').all() as Record<
      string,
      unknown
    >[];

    return rows.map((row) =>
      this.computeHealth(row.name as string, row.last_event_at as string | null),
    );
  }

  private computeHealth(name: string, lastEventAt: string | null): SourceHealth {
    if (!lastEventAt) {
      return { name, lastEventAt: null, isHealthy: false };
    }

    const thresholdMs = config.sourceHeartbeatMinutes * 60 * 1000;
    const lastEventTime = new Date(lastEventAt).getTime();
    const isHealthy = Date.now() - lastEventTime < thresholdMs;

    return { name, lastEventAt, isHealthy };
  }
}
