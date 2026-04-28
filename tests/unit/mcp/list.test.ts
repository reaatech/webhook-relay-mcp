import { describe, it, expect, beforeEach } from 'vitest';
import { listTool } from '../../../src/mcp/tools/list.js';
import { StorageService, DatabaseService } from '../../../src/storage/index.js';

describe('webhooks.list tool', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
    // Clean up between tests since singleton persists
    const db = DatabaseService.getInstance().getDatabase();
    db.prepare('DELETE FROM subscriptions').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM webhook_sources').run();
  });

  it('should return empty list when no subscriptions exist', async () => {
    const result = await listTool.execute({});
    const text = result.content[0]?.text ?? '{}';
    const parsed = JSON.parse(text);

    expect(parsed.subscriptions).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it('should list active subscriptions', async () => {
    const storage = StorageService.getInstance();
    await storage.subscriptions.create({
      eventTypes: ['payment.*'],
      isActive: true,
    });

    const result = await listTool.execute({});
    const text = result.content[0]?.text ?? '{}';
    const parsed = JSON.parse(text);

    expect(parsed.count).toBe(1);
    expect(parsed.subscriptions[0]?.eventTypes).toEqual(['payment.*']);
    expect(parsed.subscriptions[0]?.isActive).toBe(true);
  });

  it('should filter by event type', async () => {
    const storage = StorageService.getInstance();
    await storage.subscriptions.create({
      eventTypes: ['payment.*'],
      isActive: true,
    });
    await storage.subscriptions.create({
      eventTypes: ['code.push'],
      isActive: true,
    });

    const result = await listTool.execute({ eventTypes: ['code.push'] });
    const text = result.content[0]?.text ?? '{}';
    const parsed = JSON.parse(text);

    expect(parsed.count).toBe(1);
    expect(parsed.subscriptions[0]?.eventTypes).toEqual(['code.push']);
  });

  it('should respect activeOnly=false to show inactive subscriptions', async () => {
    const storage = StorageService.getInstance();
    await storage.subscriptions.create({
      eventTypes: ['test.*'],
      isActive: true,
    });
    await storage.subscriptions.create({
      eventTypes: ['inactive.*'],
      isActive: false,
    });

    const activeResult = await listTool.execute({ activeOnly: true });
    const activeParsed = JSON.parse(activeResult.content[0]?.text ?? '{}');
    expect(activeParsed.count).toBe(1);

    const allResult = await listTool.execute({ activeOnly: false });
    const allParsed = JSON.parse(allResult.content[0]?.text ?? '{}');
    expect(allParsed.count).toBe(2);
  });

  it('should respect limit parameter', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 5; i++) {
      await storage.subscriptions.create({
        eventTypes: [`type.${i}`],
        isActive: true,
      });
    }

    const result = await listTool.execute({ limit: 3 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(3);
    expect(parsed.subscriptions.length).toBe(3);
  });

  it('should cap limit at 100', async () => {
    const storage = StorageService.getInstance();
    for (let i = 0; i < 5; i++) {
      await storage.subscriptions.create({
        eventTypes: [`type.${i}`],
        isActive: true,
      });
    }

    // Even if we request 200, it should cap at 100 and return all 5
    const result = await listTool.execute({ limit: 200 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.count).toBe(5);
  });
});
