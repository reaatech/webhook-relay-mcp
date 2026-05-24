import { deleteSourceTool } from '@reaatech/webhook-relay-mcp';
import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.delete-source tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  it('should delete an existing source', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-to-delete',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-to-delete',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await deleteSourceTool.execute({ name: 'stripe-to-delete' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.deletedSource).toBe('stripe-to-delete');
    expect(parsed.message).toContain('has been deleted');

    const deleted = await storage.sources.findByName('stripe-to-delete');
    expect(deleted).toBeNull();
  });

  it('should throw for non-existent source', async () => {
    await expect(deleteSourceTool.execute({ name: 'non-existent' })).rejects.toThrow('not found');
  });

  it('should require name parameter', async () => {
    await expect(deleteSourceTool.execute({})).rejects.toThrow('name is required');
  });

  it('should reject empty name', async () => {
    await expect(deleteSourceTool.execute({ name: '' })).rejects.toThrow('name is required');
  });
});
