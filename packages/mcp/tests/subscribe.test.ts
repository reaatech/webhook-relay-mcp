import { subscribeTool } from '@reaatech/webhook-relay-mcp';
import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.subscribe tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM subscriptions').run();
  });

  it('should create a subscription', async () => {
    const result = await subscribeTool.execute({
      eventTypes: ['payment.*'],
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.subscriptionId).toBeDefined();
    expect(parsed.eventTypes).toEqual(['payment.*']);
    expect(parsed.expiresAt).toBeDefined();
  });

  it('should create subscription with filters', async () => {
    const result = await subscribeTool.execute({
      eventTypes: ['code.push'],
      filters: { source: 'github' },
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.subscriptionId).toBeDefined();
  });

  it('should cap TTL at 86400', async () => {
    const result = await subscribeTool.execute({
      eventTypes: ['test.*'],
      ttl: 200000,
    });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    const expiresAt = new Date(parsed.expiresAt);
    const now = new Date();
    const diffHours = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeLessThanOrEqual(25);
  });

  it('should reject empty eventTypes', async () => {
    await expect(subscribeTool.execute({ eventTypes: [] })).rejects.toThrow();
  });

  it('should reject non-array eventTypes', async () => {
    await expect(subscribeTool.execute({ eventTypes: 'not-array' })).rejects.toThrow();
  });
});
