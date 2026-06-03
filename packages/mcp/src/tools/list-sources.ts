import { logger } from '@reaatech/webhook-relay-core';
import type { WebhookSourceEntity } from '@reaatech/webhook-relay-storage';
import { StorageService } from '@reaatech/webhook-relay-storage';
import { defineTool, type ToolInputSchema } from '../types.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    activeOnly: {
      type: 'boolean',
      description: 'Only return active sources (default: false)',
    },
    sourceType: {
      type: 'string',
      description: 'Filter by source type (e.g., "stripe", "github")',
    },
  },
};

export const listSourcesTool = defineTool(
  'webhooks.list-sources',
  'List all registered webhook sources with health status.',
  inputSchema,
  async (args) => {
    const { activeOnly = false, sourceType } = args;

    try {
      const storage = StorageService.getInstance();

      let sources: WebhookSourceEntity[];

      if (sourceType && typeof sourceType === 'string') {
        sources = await storage.sources.findBySourceType(sourceType);
      } else {
        sources = await storage.sources.list();
      }

      let filtered = sources;

      if (activeOnly) {
        filtered = filtered.filter((s) => s.isActive);
      }

      const mapped = filtered.map((s) => ({
        name: s.name,
        sourceType: s.sourceType,
        isActive: s.isActive,
        endpointUrl: s.endpointUrl,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));

      logger.info(
        { event: 'list_sources', count: mapped.length, activeOnly, sourceType: sourceType ?? null },
        'Listed webhook sources',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sources: mapped,
                count: mapped.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'list_sources_error' }, 'Failed to list sources');
      throw new Error(
        `Failed to list sources: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
