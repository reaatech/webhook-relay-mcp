import type { Application } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { MCPServer } from './server.js';
import { registerAllTools } from './tools/index.js';
import { StorageService } from '../storage/index.js';
import { logger } from '../utils/logger.js';

export async function startMCPServer(): Promise<MCPServer> {
  const storage = StorageService.getInstance();
  await storage.initialize();

  const server = new MCPServer();
  registerAllTools(server);

  await server.connectStdio();

  logger.info({ transport: 'stdio' }, 'MCP server started');

  return server;
}

interface SessionTransport {
  transport: StreamableHTTPServerTransport;
  server: MCPServer;
}

const sessions = new Map<string, SessionTransport>();

export function setupMcpHttpRoutes(app: Application): void {
  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId) {
        const session = sessions.get(sessionId);
        if (session) {
          await session.transport.handleRequest(req, res, req.body);
          return;
        }
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            logger.info({ sessionId: sid }, 'MCP HTTP session initialized');
            sessions.set(sid, { transport, server: mcpServer });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions.has(sid)) {
            logger.info({ sessionId: sid }, 'MCP HTTP session closed');
            sessions.delete(sid);
          }
        };

        const mcpServer = new MCPServer();
        registerAllTools(mcpServer);
        await mcpServer.connectTransport(transport as Transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
    } catch (error) {
      logger.error({ error, event: 'mcp_http_error' }, 'Error handling MCP HTTP request');
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessions.get(sessionId);
    if (session) {
      await session.transport.handleRequest(req, res);
    }
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = sessions.get(sessionId);
    if (session) {
      await session.transport.handleRequest(req, res);
    }
  });

  logger.info({}, 'MCP HTTP routes registered on /mcp');
}
