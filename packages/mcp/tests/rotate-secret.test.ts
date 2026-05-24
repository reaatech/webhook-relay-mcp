import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { rotateSecretTool } from '@reaatech/webhook-relay-tools';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.rotate-secret tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  it('should rotate secret for an existing source', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-rotate',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-rotate',
      signingSecret: 'old-secret-value',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await rotateSecretTool.execute({
      name: 'stripe-rotate',
      newSecret: 'new-secret-long-enough-for-test',
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.source).toBe('stripe-rotate');
    expect(parsed.secretRotated).toBe(true);
    expect(parsed.rotatedAt).toBeDefined();

    const updated = await storage.sources.findByName('stripe-rotate');
    expect(updated?.signingSecret).not.toBe('old-secret-value');
  });

  it('should throw for non-existent source', async () => {
    await expect(
      rotateSecretTool.execute({
        name: 'non-existent',
        newSecret: 'some-long-enough-secret',
      }),
    ).rejects.toThrow('not found');
  });

  it('should require name parameter', async () => {
    await expect(rotateSecretTool.execute({ newSecret: 'some-secret' })).rejects.toThrow(
      'name is required',
    );
  });

  it('should reject short newSecret', async () => {
    await expect(rotateSecretTool.execute({ name: 'test', newSecret: 'short' })).rejects.toThrow(
      'at least 8 characters',
    );
  });

  it('should reject non-string newSecret', async () => {
    await expect(rotateSecretTool.execute({ name: 'test', newSecret: 123 })).rejects.toThrow(
      'at least 8 characters',
    );
  });
});
