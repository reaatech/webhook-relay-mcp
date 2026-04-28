import { defineTool, type ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    subscriptionId: {
      type: 'string',
      description: 'Subscription ID to cancel',
    },
  },
  required: ['subscriptionId'],
};

export const unsubscribeTool = defineTool(
  'webhooks.unsubscribe',
  'Cancel an active event subscription.',
  inputSchema,
  async (args) => {
    const { subscriptionId } = args;

    if (typeof subscriptionId !== 'string') {
      throw new Error('subscriptionId must be a string');
    }

    try {
      const storage = StorageService.getInstance();

      const subscription = await storage.subscriptions.findById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      await storage.subscriptions.update(subscriptionId, { isActive: false });

      logger.info({ event: 'subscription_cancelled', subscriptionId }, 'Subscription cancelled');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                subscriptionId,
                status: 'cancelled',
                message: 'Subscription has been cancelled. No more events will be delivered.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      logger.error({ error, event: 'unsubscribe_error', subscriptionId }, 'Failed to unsubscribe');
      throw new Error(
        `Failed to unsubscribe: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }
);
