import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { sourceHealthTool } from '@reaatech/webhook-relay-tools';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.source-health tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
    db.prepare('DELETE FROM events').run();
  });

  it('should report healthy for active source with recent event', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-healthy',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-healthy',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    await storage.sources.create({
      name: 'stripe-no-events',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-no-events',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await sourceHealthTool.execute({ name: 'stripe-no-events' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.sources[0]?.isHealthy).toBe(false);
    expect(parsed.sources[0]?.status).toBe('no_events');
  });

  it('should check health for all sources when no name provided', async () => {
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
      sourceType: 'github',
      endpointUrl: 'http://localhost/b',
      signingSecret: 'secret',
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    const result = await sourceHealthTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.sources).toHaveLength(2);
    expect(parsed.checkedAt).toBeDefined();
    expect(parsed.heartbeatWindowHours).toBe(24);
  });

  it('should throw for non-existent source', async () => {
    await expect(sourceHealthTool.execute({ name: 'non-existent' })).rejects.toThrow('not found');
  });

  it('should report stale for source with old event', async () => {
    const storage = StorageService.getInstance();
    const staleSource = await storage.sources.create({
      name: 'stripe-stale',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-stale',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('UPDATE webhook_sources SET last_event_at = ? WHERE id = ?').run(
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      staleSource.id,
    );

    const result = await sourceHealthTool.execute({ name: 'stripe-stale' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.sources[0]?.isHealthy).toBe(false);
    expect(parsed.sources[0]?.status).toBe('stale');
    expect(parsed.sources[0]?.minutesSinceLastEvent).toBeGreaterThan(0);
  });
});
