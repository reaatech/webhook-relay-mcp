import { logger } from '@reaatech/webhook-relay-core';
import { StorageService } from '@reaatech/webhook-relay-storage';
import type { EventEntity } from '@reaatech/webhook-relay-storage';
import { type ToolInputSchema, defineTool } from '../types.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    eventId: {
      type: 'string',
      description: 'Single event ID to replay',
    },
    startTime: {
      type: 'string',
      description: 'Start time in ISO 8601 format for batch replay',
    },
    endTime: {
      type: 'string',
      description: 'End time in ISO 8601 format for batch replay',
    },
    limit: {
      type: 'number',
      description: 'Maximum events to replay (default: 10, max: 50)',
    },
  },
};

export const replayTool = defineTool(
  'webhooks.replay',
  'Re-process a stored event by event ID or time range. Returns original and re-normalized payload.',
  inputSchema,
  async (args) => {
    const { eventId, startTime, endTime, limit = 10 } = args;

    const effectiveLimit = Math.min(limit as number, 50);

    try {
      const storage = StorageService.getInstance();
      let events: EventEntity[];

      if (eventId && typeof eventId === 'string') {
        const event = await storage.events.findById(eventId);
        if (!event) {
          throw new Error(`Event "${eventId}" not found`);
        }
        events = [event];
      } else {
        events = await storage.events.list({
          ...(startTime ? { startTime: startTime as string } : {}),
          ...(endTime ? { endTime: endTime as string } : {}),
          limit: effectiveLimit,
          orderBy: 'timestamp',
          order: 'DESC',
        });
      }

      const replayed = events.map((e) => ({
        eventId: e.id,
        source: e.source,
        type: e.type,
        timestamp: e.timestamp,
        original: {
          rawPayload: e.rawPayload,
          data: e.data,
          metadata: e.metadata,
        },
        reNormalized: {
          data: e.data,
          rawPayload: e.rawPayload,
          type: e.type,
          source: e.source,
          sourceType: e.sourceType,
          timestamp: e.timestamp,
        },
      }));

      logger.info(
        { event: 'replay_executed', count: replayed.length, eventId: eventId ?? null },
        'Replay executed',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                replayedEvents: replayed,
                count: replayed.length,
                message:
                  events.length === 1
                    ? `Replayed event ${events[0]?.id}`
                    : `Replayed ${events.length} event(s)`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'replay_error' }, 'Replay failed');
      throw new Error(
        `Replay failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
