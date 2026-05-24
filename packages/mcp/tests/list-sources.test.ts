import { DatabaseService, StorageService } from '@reaatech/webhook-relay-storage';
import { listSourcesTool } from '@reaatech/webhook-relay-tools';
import { beforeEach, describe, expect, it } from 'vitest';

describe('webhooks.list-sources tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  it('should list all sources', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-prod',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-prod',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await storage.sources.create({
      name: 'github-dev',
      sourceType: 'github',
      endpointUrl: 'http://localhost/webhooks/github-dev',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await listSourcesTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(2);
    expect(parsed.sources).toHaveLength(2);
  });

  it('should filter by sourceType', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-prod',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-prod',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await storage.sources.create({
      name: 'github-dev',
      sourceType: 'github',
      endpointUrl: 'http://localhost/webhooks/github-dev',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await listSourcesTool.execute({ sourceType: 'stripe' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(1);
    expect(parsed.sources[0]?.sourceType).toBe('stripe');
  });

  it('should filter with activeOnly', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-active',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-active',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    await storage.sources.create({
      name: 'stripe-inactive',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-inactive',
      signingSecret: 'secret',
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    const result = await listSourcesTool.execute({ activeOnly: true });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(1);
    expect(parsed.sources[0]?.name).toBe('stripe-active');
    expect(parsed.sources[0]?.isActive).toBe(true);
  });

  it('should return empty list when no sources exist', async () => {
    const result = await listSourcesTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.sources).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('should include relevant fields in response', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-test',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-test',
      signingSecret: 'secret',
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await listSourcesTool.execute({});
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    const entry = parsed.sources[0];
    expect(entry).toHaveProperty('name');
    expect(entry).toHaveProperty('sourceType');
    expect(entry).toHaveProperty('isActive');
    expect(entry).toHaveProperty('endpointUrl');
    expect(entry).toHaveProperty('createdAt');
    expect(entry).toHaveProperty('updatedAt');
  });
});
