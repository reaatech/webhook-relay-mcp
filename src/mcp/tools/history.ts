import { defineTool, type ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    eventTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by event types',
    },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by sources (e.g., "stripe", "github")',
    },
    startTime: {
      type: 'string',
      description: 'Start time in ISO 8601 format',
    },
    endTime: {
      type: 'string',
      description: 'End time in ISO 8601 format',
    },
    correlationId: {
      type: 'string',
      description: 'Filter by correlation ID for tracing',
    },
    limit: {
      type: 'number',
      description: 'Page size (default: 50, max: 100)',
    },
    cursor: {
      type: 'string',
      description: 'Pagination cursor for next page (base64 encoded timestamp+id)',
    },
  },
};

export const historyTool = defineTool(
  'webhooks.history',
  'Query historical webhook events with pagination and filtering.',
  inputSchema,
  async (args) => {
    const { eventTypes, sources, startTime, endTime, correlationId, limit = 50, cursor } = args;

    const effectiveLimit = Math.min(limit as number, 100);

    try {
      const storage = StorageService.getInstance();

      let cursorTimestamp: string | undefined;
      let cursorId: string | undefined;

      if (cursor) {
        try {
          const parsed = JSON.parse(Buffer.from(cursor as string, 'base64').toString()) as {
            t: string;
            i: string;
          };
          cursorTimestamp = parsed.t;
          cursorId = parsed.i;
        } catch {
          throw new Error('Invalid cursor format');
        }
      }

      const events = await storage.events.list({
        ...(Array.isArray(eventTypes) ? { types: eventTypes as string[] } : {}),
        ...(Array.isArray(sources) ? { sources: sources as string[] } : {}),
        ...(startTime ? { startTime: startTime as string } : {}),
        ...(endTime ? { endTime: endTime as string } : {}),
        ...(correlationId ? { correlationId: correlationId as string } : {}),
        ...(cursorTimestamp && cursorId ? { cursorTimestamp, cursorId } : {}),
        limit: effectiveLimit + 1,
        orderBy: 'timestamp',
        order: 'DESC',
      });

      const hasMore = events.length > effectiveLimit;
      const pageEvents = events.slice(0, effectiveLimit);

      let nextCursor: string | null = null;
      if (hasMore) {
        const lastEvent = pageEvents[pageEvents.length - 1];
        if (lastEvent) {
          nextCursor = Buffer.from(
            JSON.stringify({
              t: lastEvent.timestamp,
              i: lastEvent.id,
            })
          ).toString('base64');
        }
      }

      logger.info(
        {
          event: 'history_query',
          count: pageEvents.length,
          hasMore,
          eventTypes,
          sources,
        },
        'History query executed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                events: pageEvents.map((e) => ({
                  id: e.id,
                  type: e.type,
                  source: e.source,
                  sourceType: e.sourceType,
                  timestamp: e.timestamp,
                  receivedAt: e.receivedAt,
                  correlationId: e.correlationId,
                  data: e.data,
                })),
                hasMore,
                nextCursor,
                count: pageEvents.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'history_error' }, 'History query failed');
      throw new Error(
        `History query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
