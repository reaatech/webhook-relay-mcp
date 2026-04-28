import { describe, it, expect, beforeEach } from 'vitest';
import { unsubscribeTool } from '../../../src/mcp/tools/unsubscribe.js';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('webhooks.unsubscribe tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM subscriptions').run();
  });

  it('should cancel an active subscription', async () => {
    const storage = StorageService.getInstance();
    const sub = await storage.subscriptions.create({
      eventTypes: ['test.*'],
      isActive: true,
    });

    const result = await unsubscribeTool.execute({ subscriptionId: sub.id });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.status).toBe('cancelled');
    expect(parsed.subscriptionId).toBe(sub.id);

    const updated = await storage.subscriptions.findById(sub.id);
    expect(updated?.isActive).toBe(false);
  });

  it('should reject missing subscription', async () => {
    await expect(unsubscribeTool.execute({ subscriptionId: 'non-existent-id' })).rejects.toThrow(
      'not found'
    );
  });

  it('should reject non-string subscriptionId', async () => {
    await expect(unsubscribeTool.execute({ subscriptionId: 123 })).rejects.toThrow(
      'subscriptionId must be a string'
    );
  });
});
