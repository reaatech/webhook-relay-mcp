import { encryptSecret, logger } from '@reaatech/webhook-relay-core';
import { StorageService } from '@reaatech/webhook-relay-storage';
import { defineTool, type ToolInputSchema } from '../types.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Name of the webhook source',
    },
    newSecret: {
      type: 'string',
      description: 'New signing secret (min 8 characters)',
    },
  },
  required: ['name', 'newSecret'],
};

export const rotateSecretTool = defineTool(
  'webhooks.rotate-secret',
  "Rotate a webhook source's signing secret.",
  inputSchema,
  async (args) => {
    const { name, newSecret } = args;

    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('name is required');
    }

    if (typeof newSecret !== 'string' || newSecret.length < 8) {
      throw new Error('newSecret must be at least 8 characters');
    }

    try {
      const storage = StorageService.getInstance();

      const source = await storage.sources.findByName(name);
      if (!source) {
        throw new Error(`Webhook source "${name}" not found`);
      }

      const encryptedSecret = await encryptSecret(newSecret);

      await storage.sources.update(source.id, { signingSecret: encryptedSecret });

      logger.info(
        { event: 'secret_rotated', name: source.name, sourceId: source.id },
        'Signing secret rotated',
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                source: source.name,
                secretRotated: true,
                rotatedAt: new Date().toISOString(),
                message: `Signing secret for "${source.name}" has been rotated. Update your webhook provider with the new secret.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'rotate_secret_error', name }, 'Failed to rotate secret');
      throw new Error(
        `Failed to rotate secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  },
);
