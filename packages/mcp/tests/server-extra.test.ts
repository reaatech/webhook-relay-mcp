import { describe, expect, it, vi } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(function () {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

import { defineTool, MCPServer } from '@reaatech/webhook-relay-tools';

describe('MCPServer extra', () => {
  it('should get server instance', () => {
    const server = new MCPServer();
    const instance = server.getServerInstance();
    expect(instance).toBeDefined();
  });

  it('should connect via stdio', async () => {
    const server = new MCPServer();
    await expect(server.connectStdio()).resolves.toBeUndefined();
  });

  it('should disconnect after stdio connection', async () => {
    const server = new MCPServer();
    await server.connectStdio();
    await expect(server.disconnect()).resolves.toBeUndefined();
  });

  it('should disconnect when no transport', async () => {
    const server = new MCPServer();
    await expect(server.disconnect()).resolves.toBeUndefined();
  });

  it('should connect a custom transport', async () => {
    const server = new MCPServer();
    const mockTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };
    await expect(server.connectTransport(mockTransport as never)).resolves.toBeUndefined();
  });

  it('should register tool via static method', () => {
    const tool = defineTool(
      'extra.test.static',
      'Static register test',
      { type: 'object', properties: {} },
      async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    );
    expect(() => MCPServer.registerTool(tool)).not.toThrow();
  });
});
