import { logger } from '@reaatech/webhook-relay-core';
import { DatabaseService } from '@reaatech/webhook-relay-storage';
import { defineTool, type ToolInputSchema } from '../types.js';

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
      description: 'Filter by sources',
    },
    startTime: {
      type: 'string',
      description: 'Start time in ISO 8601 format',
    },
    endTime: {
      type: 'string',
      description: 'End time in ISO 8601 format',
    },
    groupBy: {
      type: 'string',
      enum: ['type', 'source', 'hour', 'day'],
      description: 'Grouping dimension',
    },
  },
  required: ['groupBy'],
};

export const statsTool = defineTool(
  'webhooks.stats',
  'Returns event counts grouped by type, source, or time bucket.',
  inputSchema,
  async (args) => {
    const { eventTypes, sources, startTime, endTime, groupBy } = args;

    if (typeof groupBy !== 'string' || !['type', 'source', 'hour', 'day'].includes(groupBy)) {
      throw new Error('groupBy must be one of: type, source, hour, day');
    }

    try {
      const db = DatabaseService.getInstance().getDatabase();

      let groupExpr: string;
      let selectExpr: string;

      switch (groupBy) {
        case 'type':
          groupExpr = 'type';
          selectExpr = 'type AS "group"';
          break;
        case 'source':
          groupExpr = 'source';
          selectExpr = 'source AS "group"';
          break;
        case 'hour':
          groupExpr = "strftime('%Y-%m-%dT%H:00:00Z', timestamp)";
          selectExpr = `${groupExpr} AS "group"`;
          break;
        case 'day':
          groupExpr = "strftime('%Y-%m-%d', timestamp)";
          selectExpr = `${groupExpr} AS "group"`;
          break;
        default:
          throw new Error(`Invalid groupBy: ${groupBy}`);
      }

      let query = `SELECT ${selectExpr}, COUNT(*) AS count FROM events WHERE 1=1`;
      const params: unknown[] = [];

      if (Array.isArray(eventTypes) && eventTypes.length > 0) {
        query += ` AND type IN (${eventTypes.map(() => '?').join(',')})`;
        params.push(...eventTypes);
      }

      if (Array.isArray(sources) && sources.length > 0) {
        query += ` AND source IN (${sources.map(() => '?').join(',')})`;
        params.push(...sources);
      }

      if (startTime) {
        query += ' AND timestamp >= ?';
        params.push(startTime);
      }

      if (endTime) {
        query += ' AND timestamp <= ?';
        params.push(endTime);
      }

      query += ` GROUP BY ${groupExpr} ORDER BY count DESC`;

      const rows = db.prepare(query).all(...params) as Array<{ group: string; count: number }>;

      logger.info({ event: 'stats_query', groupBy, count: rows.length }, 'Stats query executed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stats: rows.map((row) => ({
                  group: row.group,
                  count: row.count,
                })),
                groupBy,
                total: rows.reduce((sum, r) => sum + r.count, 0),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'stats_error' }, 'Stats query failed');
      throw new Error(
        `Stats query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
