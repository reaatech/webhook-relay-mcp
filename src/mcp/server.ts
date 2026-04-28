import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import type { ToolHandler } from './types.js';

export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private static toolHandlers = new Map<string, ToolHandler>();

  constructor() {
    this.server = MCPServer.createServerInstance();
  }

  static createServerInstance(): Server {
    const server = new Server(
      {
        name: 'webhook-relay-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(MCPServer.toolHandlers.values()).map((handler) => handler.definition),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const handler = MCPServer.toolHandlers.get(name);
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }

      logger.info({ event: 'mcp_tool_call', tool: name }, 'MCP tool called');

      try {
        const result = await handler.execute(args as Record<string, unknown>);
        logger.info({ event: 'mcp_tool_success', tool: name }, 'MCP tool executed');
        return result;
      } catch (error) {
        logger.error(
          {
            event: 'mcp_tool_error',
            tool: name,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'MCP tool failed'
        );
        throw error;
      }
    });

    return server;
  }

  static registerTool(handler: ToolHandler): void {
    MCPServer.toolHandlers.set(handler.definition.name, handler);
    logger.info({ tool: handler.definition.name }, 'Tool registered');
  }

  registerTool(handler: ToolHandler): void {
    MCPServer.registerTool(handler);
  }

  async connectStdio(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    logger.info({}, 'MCP server connected via stdio');
  }

  async connectTransport(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  getServerInstance(): Server {
    return this.server;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}
