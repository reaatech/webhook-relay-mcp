import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server.js', () => ({
  createApp: vi.fn(),
  startHttpServer: vi.fn(),
}));

vi.mock('@reaatech/webhook-relay-tools', () => ({
  startMCPServer: vi.fn(),
}));

describe('index.ts with SSE transport', () => {
  beforeAll(() => {
    process.env.MCP_TRANSPORT = 'sse';
    vi.resetModules();
  });

  afterAll(() => {
    process.env.MCP_TRANSPORT = undefined;
  });

  it('calls startHttpServer from else branch when transport is sse', async () => {
    await import('../src/index.js');

    const { startHttpServer } = await import('../src/server.js');
    expect(startHttpServer).toHaveBeenCalled();
  });
});

describe('index.ts catch block', () => {
  beforeAll(() => {
    vi.resetModules();
  });

  it('handles error in main() catch block', async () => {
    vi.doMock('../src/server.js', () => ({
      createApp: vi.fn(),
      startHttpServer: vi.fn(() => {
        throw new Error('start failed');
      }),
    }));
    vi.doMock('@reaatech/webhook-relay-tools', () => ({
      startMCPServer: vi.fn(() => Promise.reject(new Error('mcp failed'))),
    }));

    process.env.MCP_TRANSPORT = 'sse';
    const origExit = process.exit;
    const exitMock = vi.fn();
    process.exit = exitMock as unknown as typeof process.exit;

    await import('../src/index.js');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitMock).toHaveBeenCalledWith(1);

    process.exit = origExit;
    process.env.MCP_TRANSPORT = undefined;
  });
});
