import { logger } from '@reaatech/webhook-relay-core';
import type { WebhookSourceEntity } from '@reaatech/webhook-relay-storage';
import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { defineTool, type ToolInputSchema } from '../types.js';

const DEFAULT_HEARTBEAT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Optional source name to check. If not provided, checks all sources.',
    },
  },
};

export const sourceHealthTool = defineTool(
  'webhooks.source-health',
  'Check health status of webhook sources based on last event received time.',
  inputSchema,
  async (args) => {
    const { name } = args;

    try {
      const storage = StorageService.getInstance();

      let sources: WebhookSourceEntity[];

      if (name && typeof name === 'string') {
        const source = await storage.sources.findByName(name);
        if (!source) {
          throw new Error(`Webhook source "${name}" not found`);
        }
        sources = [source];
      } else {
        sources = await storage.sources.list();
      }

      const db = DatabaseService.getInstance().getDatabase();

      const healthResults = sources.map((source) => {
        const row = db
          .prepare('SELECT last_event_at FROM webhook_sources WHERE id = ?')
          .get(source.id) as { last_event_at: string | null } | undefined;

        const lastEventAt = row?.last_event_at ?? null;
        const now = new Date();
        const isHealthy =
          lastEventAt !== null &&
          now.getTime() - new Date(lastEventAt).getTime() < DEFAULT_HEARTBEAT_WINDOW_MS;

        const minutesSinceLastEvent = lastEventAt
          ? Math.round((now.getTime() - new Date(lastEventAt).getTime()) / 60000)
          : null;

        return {
          name: source.name,
          sourceType: source.sourceType,
          isActive: source.isActive,
          lastEventAt,
          isHealthy: source.isActive ? isHealthy : false,
          minutesSinceLastEvent,
          status: !source.isActive
            ? 'inactive'
            : isHealthy
              ? 'healthy'
              : lastEventAt === null
                ? 'no_events'
                : 'stale',
        };
      });

      logger.info(
        { event: 'source_health_check', count: healthResults.length },
        'Source health check completed',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sources: healthResults,
                checkedAt: new Date().toISOString(),
                heartbeatWindowHours: DEFAULT_HEARTBEAT_WINDOW_MS / 3600000,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'source_health_error' }, 'Source health check failed');
      throw new Error(
        `Source health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
