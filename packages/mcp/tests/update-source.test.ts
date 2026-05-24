import { updateSourceTool } from '@reaatech/webhook-relay-mcp';
import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.update-source tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  it('should update source name', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-old',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-old',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await updateSourceTool.execute({
      name: 'stripe-old',
      updates: { newName: 'stripe-new' },
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.name).toBe('stripe-new');
    expect(parsed.appliedChanges).toContain('name');
  });

  it('should update signing secret', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-prod',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-prod',
      signingSecret: 'old-secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await updateSourceTool.execute({
      name: 'stripe-prod',
      updates: { signingSecret: 'new-secret-long-enough' },
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.appliedChanges).toContain('signingSecret');
  });

  it('should update isActive status', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-test',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-test',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await updateSourceTool.execute({
      name: 'stripe-test',
      updates: { isActive: false },
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.isActive).toBe(false);
    expect(parsed.appliedChanges).toContain('isActive');
  });

  it('should update webhookUrl', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-url',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-url',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await updateSourceTool.execute({
      name: 'stripe-url',
      updates: { webhookUrl: 'https://example.com/webhooks/new' },
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.appliedChanges).toContain('endpointUrl');
  });

  it('should throw for non-existent source', async () => {
    await expect(
      updateSourceTool.execute({
        name: 'non-existent',
        updates: { isActive: false },
      }),
    ).rejects.toThrow('not found');
  });

  it('should throw for duplicate newName', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'source-a',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/a',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await storage.sources.create({
      name: 'source-b',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/b',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    await expect(
      updateSourceTool.execute({
        name: 'source-a',
        updates: { newName: 'source-b' },
      }),
    ).rejects.toThrow('already in use');
  });

  it('should require name parameter', async () => {
    await expect(updateSourceTool.execute({})).rejects.toThrow('name is required');
  });

  it('should require updates object', async () => {
    await expect(updateSourceTool.execute({ name: 'test', updates: {} })).rejects.toThrow(
      'at least one field',
    );
  });

  it('should reject short signing secret', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-sec',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/stripe-sec',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    await expect(
      updateSourceTool.execute({
        name: 'stripe-sec',
        updates: { signingSecret: 'short' },
      }),
    ).rejects.toThrow('at least 8 characters');
  });

  it('should reject unknown update fields', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'test-source',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/test',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    await expect(
      updateSourceTool.execute({
        name: 'test-source',
        updates: { unknownField: 'value' },
      }),
    ).rejects.toThrow('No valid update fields provided');
  });
});
