import { encryptSecret, logger } from '@reaatech/webhook-relay-core';
import { StorageService } from '@reaatech/webhook-relay-storage';
import { type ToolInputSchema, defineTool } from '../types.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Name of the webhook source to update',
    },
    updates: {
      type: 'object',
      description: 'Fields to update: newName, signingSecret, isActive, webhookUrl',
    },
  },
  required: ['name'],
};

export const updateSourceTool = defineTool(
  'webhooks.update-source',
  'Update a registered webhook source configuration.',
  inputSchema,
  async (args) => {
    const { name, updates } = args;

    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('name is required');
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates as object).length === 0) {
      throw new Error('updates object is required with at least one field');
    }

    const updateData = updates as Record<string, unknown>;

    try {
      const storage = StorageService.getInstance();

      const source = await storage.sources.findByName(name);
      if (!source) {
        throw new Error(`Webhook source "${name}" not found`);
      }

      const changes: Record<string, unknown> = {};

      if (updateData.newName && typeof updateData.newName === 'string') {
        const existing = await storage.sources.findByName(updateData.newName);
        if (existing && existing.id !== source.id) {
          throw new Error(`Source name "${updateData.newName}" is already in use`);
        }
        changes.name = updateData.newName;
      }

      if (updateData.signingSecret && typeof updateData.signingSecret === 'string') {
        if (updateData.signingSecret.length < 8) {
          throw new Error('signingSecret must be at least 8 characters');
        }
        changes.signingSecret = await encryptSecret(updateData.signingSecret);
      }

      if (updateData.isActive !== undefined && typeof updateData.isActive === 'boolean') {
        changes.isActive = updateData.isActive;
      }

      if (updateData.webhookUrl && typeof updateData.webhookUrl === 'string') {
        changes.endpointUrl = updateData.webhookUrl;
      }

      if (Object.keys(changes).length === 0) {
        throw new Error('No valid update fields provided');
      }

      const updated = await storage.sources.update(source.id, changes);
      if (!updated) {
        throw new Error('Failed to apply updates');
      }

      const refreshed = await storage.sources.findById(source.id);

      logger.info(
        { event: 'source_updated', name: source.name, changes: Object.keys(changes) },
        'Webhook source updated',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: refreshed?.name,
                sourceType: refreshed?.sourceType,
                endpointUrl: refreshed?.endpointUrl,
                isActive: refreshed?.isActive,
                updatedAt: refreshed?.updatedAt,
                appliedChanges: Object.keys(changes),
                message: `Source "${refreshed?.name}" updated successfully`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'update_source_error', name }, 'Failed to update source');
      throw new Error(
        `Failed to update source: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
