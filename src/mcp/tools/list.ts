import { defineTool, type ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';
import { matchEventType } from '../../utils/patterns.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    activeOnly: {
      type: 'boolean',
      description: 'Only return active subscriptions (default: true)',
    },
    eventTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by event type patterns',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of subscriptions to return (default: 50, max: 100)',
    },
  },
};

export const listTool = defineTool(
  'webhooks.list',
  'List webhook subscriptions with optional filtering.',
  inputSchema,
  async (args) => {
    const { activeOnly = true, eventTypes, limit = 50 } = args;
    const effectiveLimit = Math.min(limit as number, 100);

    try {
      const storage = StorageService.getInstance();
      const subscriptions = await storage.subscriptions.list({ limit: effectiveLimit });

      let filtered = subscriptions;

      if (activeOnly) {
        const now = new Date().toISOString();
        filtered = filtered.filter((sub) => {
          return sub.isActive && (!sub.expiresAt || sub.expiresAt > now);
        });
      }

      if (Array.isArray(eventTypes) && eventTypes.length > 0) {
        filtered = filtered.filter((sub) =>
          sub.eventTypes.some((pattern) =>
            eventTypes.some((et: string) => matchEventType(pattern, et))
          )
        );
      }

      logger.info(
        {
          event: 'list_subscriptions',
          count: filtered.length,
          activeOnly,
        },
        'Listed subscriptions'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                subscriptions: filtered.map((sub) => ({
                  subscriptionId: sub.id,
                  eventTypes: sub.eventTypes,
                  filters: sub.filters,
                  isActive: sub.isActive,
                  expiresAt: sub.expiresAt,
                  createdAt: sub.createdAt,
                  lastPolledAt: sub.lastPolledAt,
                })),
                count: filtered.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'list_error' }, 'Failed to list subscriptions');
      throw new Error(
        `Failed to list subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
