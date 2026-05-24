import { registerAllTools } from '@reaatech/webhook-relay-tools';
import { describe, expect, it, vi } from 'vitest';

describe('registerAllTools', () => {
  it('should register all 15 tools', () => {
    const registered: string[] = [];
    const mockServer = {
      registerTool: vi.fn((tool: { definition: { name: string } }) => {
        registered.push(tool.definition.name);
      }),
    };

    registerAllTools(mockServer as never);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(15);
    expect(registered).toEqual([
      'webhooks.subscribe',
      'webhooks.poll',
      'webhooks.history',
      'webhooks.register',
      'webhooks.unsubscribe',
      'webhooks.list',
      'webhooks.stats',
      'webhooks.replay',
      'webhooks.update-source',
      'webhooks.delete-source',
      'webhooks.rotate-secret',
      'webhooks.list-sources',
      'webhooks.audit-log',
      'webhooks.source-health',
      'webhooks.event-types',
    ]);
  });
});
