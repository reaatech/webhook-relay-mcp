import { logger } from '@reaatech/webhook-relay-core';
import { StorageService } from '@reaatech/webhook-relay-storage';
import { defineTool, type ToolInputSchema } from '../types.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Name of the webhook source to delete',
    },
  },
  required: ['name'],
};

export const deleteSourceTool = defineTool(
  'webhooks.delete-source',
  'Delete a registered webhook source by name.',
  inputSchema,
  async (args) => {
    const { name } = args;

    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('name is required');
    }

    try {
      const storage = StorageService.getInstance();

      const source = await storage.sources.findByName(name);
      if (!source) {
        throw new Error(`Webhook source "${name}" not found`);
      }

      await storage.sources.delete(source.id);

      logger.info(
        { event: 'source_deleted', name: source.name, sourceId: source.id },
        'Webhook source deleted',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                deletedSource: source.name,
                sourceType: source.sourceType,
                message: `Webhook source "${source.name}" has been deleted. The endpoint ${source.endpointUrl} is no longer active.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'delete_source_error', name }, 'Failed to delete source');
      throw new Error(
        `Failed to delete source: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
