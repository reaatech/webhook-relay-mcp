import { defineTool, type ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';
import { encryptSecret } from '../../utils/crypto.js';
import { registerSourceSchema } from '../../utils/validation.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Unique name for this webhook source (e.g., "stripe-production")',
    },
    sourceType: {
      type: 'string',
      enum: ['stripe', 'github', 'replicate', 'twilio', 'generic'],
      description: 'Type of webhook source',
    },
    signingSecret: {
      type: 'string',
      description: 'Webhook signing secret from the provider',
    },
    webhookUrl: {
      type: 'string',
      description:
        'Public URL where webhooks should be sent (optional, auto-generated if not provided)',
    },
  },
  required: ['name', 'sourceType', 'signingSecret'],
};

export const registerTool = defineTool(
  'webhooks.register',
  'Register a new webhook source to receive events from external services.',
  inputSchema,
  async (args) => {
    const parsed = registerSourceSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Invalid registration parameters');
    }

    const { name, sourceType, signingSecret, webhookUrl } = parsed.data;

    try {
      const storage = StorageService.getInstance();

      const existing = await storage.sources.findByName(name);
      if (existing) {
        throw new Error(`Webhook source "${name}" already exists`);
      }

      const endpointUrl = webhookUrl ?? `${config.webhookBaseUrl}/webhooks/${name}`;
      const encryptedSecret = await encryptSecret(signingSecret);

      const source = await storage.sources.create({
        name,
        sourceType,
        endpointUrl,
        signingSecret: encryptedSecret,
        isActive: true,
        updatedAt: new Date().toISOString(),
      });

      logger.info(
        {
          event: 'source_registered',
          name: source.name,
          sourceType: source.sourceType,
          endpointUrl: source.endpointUrl,
        },
        'Webhook source registered'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: source.name,
                sourceType: source.sourceType,
                endpointUrl: source.endpointUrl,
                webhookInstructions: `Configure your ${sourceType} webhook to send events to: ${endpointUrl}`,
                nextSteps: [
                  "1. Configure the webhook URL in your provider's dashboard",
                  '2. Use webhooks.subscribe to start receiving events',
                  '3. Use webhooks.poll to retrieve events',
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'register_error' }, 'Failed to register webhook source');
      throw new Error(
        `Failed to register webhook source: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }
);
