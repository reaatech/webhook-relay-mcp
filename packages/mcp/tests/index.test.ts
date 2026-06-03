import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isInitializeRequest, mockStreamableHttp } = vi.hoisted(() => ({
  isInitializeRequest: vi.fn((body: unknown) => {
    const b = body as { method?: string } | null;
    return b?.method === 'initialize';
  }),
  mockStreamableHttp: vi.fn().mockImplementation((options) => ({
    sessionId: 'test-session',
    handleRequest: vi.fn().mockImplementation(async (_req, _res, _body) => {
      if (options.onsessioninitialized) {
        options.onsessioninitialized('test-session');
      }
    }),
    onclose: null,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(function () {
    return {
      setRequestHandler: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(function () {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: mockStreamableHttp,
}));

vi.mock('@modelcontextprotocol/sdk/types.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    isInitializeRequest,
  };
});

import {
  auditLogTool,
  defineTool,
  deleteSourceTool,
  eventTypesTool,
  historyTool,
  listSourcesTool,
  listTool,
  MCPServer,
  pollTool,
  registerAllTools,
  registerTool,
  replayTool,
  rotateSecretTool,
  setupMcpHttpRoutes,
  sourceHealthTool,
  startMCPServer,
  statsTool,
  subscribeTool,
  unsubscribeTool,
  updateSourceTool,
} from '@reaatech/webhook-relay-tools';

describe('startMCPServer', () => {
  it('should create and start an MCP server', async () => {
    const server = await startMCPServer();
    expect(server).toBeInstanceOf(MCPServer);
  });
});

describe('setupMcpHttpRoutes', () => {
  let routes: Record<string, (...args: unknown[]) => unknown>;
  let mockApp: Record<string, unknown>;

  beforeEach(() => {
    routes = {};
    mockApp = {
      post: vi.fn((path: string, handler: (...args: unknown[]) => unknown) => {
        routes[`POST ${path}`] = handler;
      }),
      get: vi.fn((path: string, handler: (...args: unknown[]) => unknown) => {
        routes[`GET ${path}`] = handler;
      }),
      delete: vi.fn((path: string, handler: (...args: unknown[]) => unknown) => {
        routes[`DELETE ${path}`] = handler;
      }),
      _getHandler: (method: string, path: string) => routes[`${method} ${path}`],
    };
  });

  it('should register POST, GET, DELETE routes on /mcp', () => {
    setupMcpHttpRoutes(mockApp as never);
    expect(mockApp.post).toHaveBeenCalledWith('/mcp', expect.any(Function));
    expect(mockApp.get).toHaveBeenCalledWith('/mcp', expect.any(Function));
    expect(mockApp.delete).toHaveBeenCalledWith('/mcp', expect.any(Function));
  });

  it('POST /mcp should return 400 for invalid request', async () => {
    setupMcpHttpRoutes(mockApp as never);
    const handler = routes['POST /mcp'];
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = { headers: {}, body: {} };
    const res = { status, json, headersSent: false };

    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32000 }),
      }),
    );
  });

  it('POST /mcp should handle initialize request', async () => {
    setupMcpHttpRoutes(mockApp as never);
    const handler = routes['POST /mcp'];
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = { headers: {}, body: { method: 'initialize', params: {} } };
    const res = { status, json, headersSent: false };

    await handler(req, res);
    expect(status).not.toHaveBeenCalledWith(400);
  });

  it('POST /mcp should return 500 on error', async () => {
    mockStreamableHttp.mockImplementationOnce(() => {
      throw new Error('Transport creation failed');
    });
    setupMcpHttpRoutes(mockApp as never);
    const handler = routes['POST /mcp'];
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = { headers: {}, body: { method: 'initialize', params: {} } };
    const res = { status, json, headersSent: false };

    await handler(req, res);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32603 }),
      }),
    );
  });

  it('GET /mcp should return 400 without session id', async () => {
    setupMcpHttpRoutes(mockApp as never);
    const handler = routes['GET /mcp'];
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));
    const req = { headers: {} };
    const res = { status, send };

    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith('Invalid or missing session ID');
  });

  it('DELETE /mcp should return 400 without session id', async () => {
    setupMcpHttpRoutes(mockApp as never);
    const handler = routes['DELETE /mcp'];
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));
    const req = { headers: {} };
    const res = { status, send };

    await handler(req, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith('Invalid or missing session ID');
  });
});

describe('exports', () => {
  it('should export MCPServer', () => {
    expect(MCPServer).toBeDefined();
  });

  it('should export registerAllTools', () => {
    expect(registerAllTools).toBeDefined();
  });

  it('should export all tool constants', () => {
    const toolExports = {
      registerTool,
      subscribeTool,
      unsubscribeTool,
      listTool,
      pollTool,
      historyTool,
      statsTool,
      replayTool,
      updateSourceTool,
      deleteSourceTool,
      rotateSecretTool,
      listSourcesTool,
      auditLogTool,
      sourceHealthTool,
      eventTypesTool,
    };
    for (const [, value] of Object.entries(toolExports)) {
      expect(value).toBeDefined();
    }
  });

  it('should export defineTool', () => {
    expect(defineTool).toBeDefined();
  });
});
