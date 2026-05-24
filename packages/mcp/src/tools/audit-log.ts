import { logger } from '@reaatech/webhook-relay-core';
import { DatabaseService } from '@reaatech/webhook-relay-storage';
import { type ToolInputSchema, defineTool } from '../types.js';

interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string | null;
  created_at: string;
}

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    actor: {
      type: 'string',
      description: 'Filter by actor',
    },
    action: {
      type: 'string',
      description: 'Filter by action (e.g., "source.created", "secret.rotated")',
    },
    resourceType: {
      type: 'string',
      description: 'Filter by resource type (e.g., "source", "subscription")',
    },
    startTime: {
      type: 'string',
      description: 'Start time in ISO 8601 format',
    },
    endTime: {
      type: 'string',
      description: 'End time in ISO 8601 format',
    },
    limit: {
      type: 'number',
      description: 'Maximum entries to return (default: 50, max: 100)',
    },
  },
};

export const auditLogTool = defineTool(
  'webhooks.audit-log',
  'Query the audit log for system actions and changes.',
  inputSchema,
  async (args) => {
    const { actor, action, resourceType, startTime, endTime, limit = 50 } = args;

    const effectiveLimit = Math.min(limit as number, 100);

    try {
      const db = DatabaseService.getInstance().getDatabase();

      let query = 'SELECT * FROM audit_log WHERE 1=1';
      const params: unknown[] = [];

      if (actor && typeof actor === 'string') {
        query += ' AND actor = ?';
        params.push(actor);
      }

      if (action && typeof action === 'string') {
        query += ' AND action = ?';
        params.push(action);
      }

      if (resourceType && typeof resourceType === 'string') {
        query += ' AND resource_type = ?';
        params.push(resourceType);
      }

      if (startTime) {
        query += ' AND created_at >= ?';
        params.push(startTime);
      }

      if (endTime) {
        query += ' AND created_at <= ?';
        params.push(endTime);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(effectiveLimit);

      const rows = db.prepare(query).all(...params) as AuditLogRow[];

      const entries = rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        details: row.details ? JSON.parse(row.details) : null,
        createdAt: row.created_at,
      }));

      logger.info(
        { event: 'audit_log_query', count: entries.length, actor, action },
        'Audit log queried',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                entries,
                count: entries.length,
                filters: { actor, action, resourceType, startTime, endTime },
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'audit_log_error' }, 'Audit log query failed');
      throw new Error(
        `Audit log query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
