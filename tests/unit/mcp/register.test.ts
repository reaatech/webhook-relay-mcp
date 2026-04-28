import { describe, it, expect, beforeEach } from 'vitest';
import { registerTool } from '../../../src/mcp/tools/register.js';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('webhooks.register tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  it('should register a new webhook source', async () => {
    const result = await registerTool.execute({
      name: 'stripe-prod',
      sourceType: 'stripe',
      signingSecret: 'whsec_test_secret_long_enough',
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.name).toBe('stripe-prod');
    expect(parsed.sourceType).toBe('stripe');
    expect(parsed.endpointUrl).toContain('/webhooks/stripe-prod');
    expect(parsed.webhookInstructions).toBeDefined();
  });

  it('should use provided webhookUrl', async () => {
    const result = await registerTool.execute({
      name: 'github-custom',
      sourceType: 'github',
      signingSecret: 'ghsec_test_secret_long_enough',
      webhookUrl: 'https://example.com/webhooks/github',
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.endpointUrl).toBe('https://example.com/webhooks/github');
  });

  it('should reject short signingSecret', async () => {
    await expect(
      registerTool.execute({
        name: 'stripe-short',
        sourceType: 'stripe',
        signingSecret: 'short',
      })
    ).rejects.toThrow();
  });

  it('should reject duplicate name', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-dup',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-dup',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    await expect(
      registerTool.execute({
        name: 'stripe-dup',
        sourceType: 'stripe',
        signingSecret: 'whsec_test_secret_long_enough',
      })
    ).rejects.toThrow('already exists');
  });

  it('should support all source types', async () => {
    const types = ['stripe', 'github', 'replicate', 'twilio', 'generic'];
    for (const sourceType of types) {
      const result = await registerTool.execute({
        name: `test-${sourceType}`,
        sourceType,
        signingSecret: 'whsec_test_secret_long_enough',
      });
      const parsed = JSON.parse(result.content[0]?.text ?? '{}');
      expect(parsed.sourceType).toBe(sourceType);
    }
  });
});
