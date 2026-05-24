import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server.js', () => ({
  createApp: vi.fn(),
  startHttpServer: vi.fn(),
}));

vi.mock('@reaatech/webhook-relay-mcp', () => ({
  startMCPServer: vi.fn(),
}));

import { createApp, startHttpServer } from '../src/index.js';

describe('index.ts exports', () => {
  beforeAll(() => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('re-exports createApp from server.js', () => {
    expect(typeof createApp).toBe('function');
  });

  it('re-exports startHttpServer from server.js', () => {
    expect(typeof startHttpServer).toBe('function');
  });

  it('main() registers signal handlers', () => {
    expect(process.listeners('SIGINT').length).toBeGreaterThan(0);
    expect(process.listeners('SIGTERM').length).toBeGreaterThan(0);
  });

  it('SIGINT handler calls process.exit', () => {
    process.emit('SIGINT');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('SIGTERM handler calls process.exit', () => {
    process.emit('SIGTERM');
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
