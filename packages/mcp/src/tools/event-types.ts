import { logger } from '@reaatech/webhook-relay-core';
import { DatabaseService } from '@reaatech/webhook-relay-storage';
import { type ToolInputSchema, defineTool } from '../types.js';

interface EventTypeRow {
  type: string;
  source: string;
  source_type: string;
  count: number;
  last_seen: string;
}

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    source: {
      type: 'string',
      description: 'Optional source filter (e.g., "stripe", "github")',
    },
  },
};

export const eventTypesTool = defineTool(
  'webhooks.event-types',
  'Discover available event types in the system with counts.',
  inputSchema,
  async (args) => {
    const { source } = args;

    try {
      const db = DatabaseService.getInstance().getDatabase();

      let query = `
        SELECT
          type,
          source,
          source_type,
          COUNT(*) AS count,
          MAX(timestamp) AS last_seen
        FROM events
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (source && typeof source === 'string') {
        query += ' AND source = ?';
        params.push(source);
      }

      query += ' GROUP BY type, source ORDER BY count DESC';

      const rows = db.prepare(query).all(...params) as EventTypeRow[];

      const eventTypes = rows.map((row) => ({
        type: row.type,
        source: row.source,
        sourceType: row.source_type,
        count: row.count,
        lastSeen: row.last_seen,
      }));

      logger.info(
        { event: 'event_types_discovery', count: eventTypes.length, source: source ?? null },
        'Event types discovered',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                eventTypes,
                totalTypes: eventTypes.length,
                totalEvents: eventTypes.reduce((sum, et) => sum + et.count, 0),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'event_types_error' }, 'Event types query failed');
      throw new Error(
        `Event types query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
