import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@reaatech/webhook-relay-storage', () => {
  return {
    CleanupService: vi.fn().mockImplementation(function () {
      return {
        start: vi.fn(),
        stop: vi.fn(),
      };
    }),
  };
});

describe('startHttpServer', () => {
  beforeAll(async () => {
    const { config } = await import('@reaatech/webhook-relay-core');
    config.port = 0;

    const { startHttpServer } = await import('../src/server.js');
    startHttpServer();

    process.exit = vi.fn() as never;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('creates server and registers signal handlers', () => {
    const sigintListeners = process.listeners('SIGINT');
    const sigtermListeners = process.listeners('SIGTERM');
    expect(sigintListeners.length).toBeGreaterThan(0);
    expect(sigtermListeners.length).toBeGreaterThan(0);
  });

  it('shutdown runs on SIGTERM without throwing', () => {
    for (const fn of process.listeners('SIGTERM')) {
      expect(() => (fn as () => void)()).not.toThrow();
    }
  });

  it('shutdown runs on SIGINT without throwing', () => {
    for (const fn of process.listeners('SIGINT')) {
      expect(() => (fn as () => void)()).not.toThrow();
    }
  });
});
