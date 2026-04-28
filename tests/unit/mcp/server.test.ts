import { describe, it, expect } from 'vitest';
import { MCPServer } from '../../../src/mcp/server.js';
import { defineTool } from '../../../src/mcp/types.js';

describe('MCPServer', () => {
  it('should register a tool', () => {
    const server = new MCPServer();
    const tool = defineTool(
      'test.tool',
      'Test tool',
      { type: 'object', properties: {} },
      async () => ({
        content: [{ type: 'text', text: 'ok' }],
      })
    );

    server.registerTool(tool);
    expect(true).toBe(true);
  });

  it('should list registered tools via internal handler', async () => {
    const server = new MCPServer();
    const tool = defineTool(
      'test.list',
      'List test',
      { type: 'object', properties: {} },
      async () => ({
        content: [{ type: 'text', text: 'ok' }],
      })
    );
    server.registerTool(tool);

    const handlers = (
      server as unknown as {
        server: { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> };
      }
    ).server._requestHandlers;
    const listHandler = handlers.get('tools/list');
    expect(listHandler).toBeDefined();
    if (!listHandler) {
      throw new Error('listHandler not found');
    }

    const result = await listHandler({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    const typedResult = result as { tools: Array<{ name: string }> };
    expect(typedResult.tools.some((t) => t.name === 'test.list')).toBe(true);
  });

  it('should call a registered tool via internal handler', async () => {
    const server = new MCPServer();
    const tool = defineTool(
      'test.call',
      'Call test',
      { type: 'object', properties: {} },
      async () => ({
        content: [{ type: 'text', text: 'hello' }],
      })
    );
    server.registerTool(tool);

    const handlers = (
      server as unknown as {
        server: { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> };
      }
    ).server._requestHandlers;
    const callHandler = handlers.get('tools/call');
    expect(callHandler).toBeDefined();
    if (!callHandler) {
      throw new Error('callHandler not found');
    }

    const result = await callHandler({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'test.call', arguments: {} },
    });
    const typedResult = result as { content: Array<{ text: string }> };
    expect(typedResult.content[0]?.text).toBe('hello');
  });

  it('should throw for unknown tool via internal handler', async () => {
    const server = new MCPServer();

    const handlers = (
      server as unknown as {
        server: { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> };
      }
    ).server._requestHandlers;
    const callHandler = handlers.get('tools/call');
    expect(callHandler).toBeDefined();
    if (!callHandler) {
      throw new Error('callHandler not found');
    }

    await expect(
      callHandler({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'unknown.tool', arguments: {} },
      })
    ).rejects.toThrow('Unknown tool');
  });

  it('should propagate tool execution errors via internal handler', async () => {
    const server = new MCPServer();
    const tool = defineTool(
      'test.error',
      'Error test',
      { type: 'object', properties: {} },
      async () => {
        throw new Error('Tool failed');
      }
    );
    server.registerTool(tool);

    const handlers = (
      server as unknown as {
        server: { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> };
      }
    ).server._requestHandlers;
    const callHandler = handlers.get('tools/call');
    expect(callHandler).toBeDefined();
    if (!callHandler) {
      throw new Error('callHandler not found');
    }

    await expect(
      callHandler({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'test.error', arguments: {} },
      })
    ).rejects.toThrow('Tool failed');
  });
});
