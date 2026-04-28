# Skill: MCP Tools

## Description

This skill handles implementing and testing MCP (Model Context Protocol) server tools for webhook-relay-mcp. It covers creating tools for subscribing to events, polling for events, querying history, and managing webhook sources.

## Capabilities

- Implement MCP server with stdio and SSE transports
- Create tools for event subscription management
- Implement blocking poll with timeout support
- Build history query with pagination
- Add webhook source registration tools
- Write comprehensive tests for MCP tools

## Required Context

- **Project**: webhook-relay-mcp
- **Architecture**: See ARCHITECTURE.md MCP server layer
- **Dependencies**: @modelcontextprotocol/sdk, express, better-sqlite3, zod
- **Existing Skills**: architecture-setup, database-design, webhook-integration

## Implementation Steps

### 1. MCP Server Setup

Create `src/mcp/server.ts`:
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { ToolHandler } from './types.js';

export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport | SSEServerTransport | null = null;
  private toolHandlers: Map<string, ToolHandler> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'webhook-relay-mcp',
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupRequestHandlers();
  }

  private setupRequestHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.toolHandlers.values()).map(handler => handler.definition),
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      const handler = this.toolHandlers.get(name);
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }

      logger.info({ event: 'mcp_tool_call', tool: name, args }, 'MCP tool called');

      try {
        const result = await handler.execute(args);
        logger.info({ event: 'mcp_tool_success', tool: name }, 'MCP tool executed');
        return result;
      } catch (error) {
        logger.error({ 
          event: 'mcp_tool_error', 
          tool: name, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }, 'MCP tool failed');
        throw error;
      }
    });
  }

  registerTool(handler: ToolHandler): void {
    this.toolHandlers.set(handler.definition.name, handler);
    logger.info({ tool: handler.definition.name }, 'Tool registered');
  }

  async connectStdio(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    logger.info({}, 'MCP server connected via stdio');
  }

  async connectSSE(path: string, httpServer: Server): Promise<void> {
    const sseTransport = new SSEServerTransport(path, httpServer);
    this.transport = sseTransport;
    await this.server.connect(sseTransport);
    logger.info({ path }, 'MCP server connected via SSE');
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  getServer(): Server {
    return this.server;
  }
}
```

Create `src/mcp/types.ts`:
```typescript
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolHandler {
  definition: Tool;
  execute(args: Record<string, unknown>): Promise<{ content: unknown[] }>;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    items?: { type: string };
    enum?: string[];
    default?: unknown;
  }>;
  required?: string[];
}

export function defineTool(
  name: string,
  description: string,
  inputSchema: ToolInputSchema,
  execute: (args: Record<string, unknown>) => Promise<{ content: unknown[] }>
): ToolHandler {
  return {
    definition: {
      name,
      description,
      inputSchema,
    },
    execute,
  };
}
```

### 2. Subscribe Tool

Create `src/mcp/tools/subscribe.ts`:
```typescript
import { ulid } from 'ulid';
import { defineTool, ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    eventTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Event type patterns to subscribe to (supports wildcards like "payment.*")',
    },
    filters: {
      type: 'object',
      description: 'Additional filter conditions (e.g., { source: "stripe" })',
    },
    ttl: {
      type: 'number',
      description: 'Subscription TTL in seconds (default: 3600, max: 86400)',
      default: 3600,
    },
  },
  required: ['eventTypes'],
};

export const subscribeTool = defineTool(
  'webhooks.subscribe',
  'Subscribe to webhook events matching specified criteria. Returns a subscription ID for polling.',
  inputSchema,
  async (args) => {
    const { eventTypes, filters, ttl = 3600 } = args;

    // Validate input
    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      throw new Error('eventTypes must be a non-empty array');
    }

    // Cap TTL at 24 hours
    const effectiveTtl = Math.min(ttl, 86400);
    const expiresAt = new Date(Date.now() + effectiveTtl * 1000).toISOString();

    try {
      const storage = StorageService.getInstance();
      const subscription = await storage.subscriptions.create({
        eventTypes: eventTypes as string[],
        filters: filters as Record<string, unknown> | undefined,
        isActive: true,
        expiresAt,
      });

      logger.info({
        event: 'subscription_created',
        subscriptionId: subscription.id,
        eventTypes,
        expiresAt,
      }, 'Subscription created');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            subscriptionId: subscription.id,
            eventTypes: subscription.eventTypes,
            expiresAt: subscription.expiresAt,
            message: `Subscribed to ${eventTypes.length} event type(s). Use webhooks.poll with this subscriptionId to receive events.`,
          }, null, 2),
        }],
      };
    } catch (error) {
      logger.error({ error, event: 'subscription_error' }, 'Failed to create subscription');
      throw new Error(`Failed to create subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
```

### 3. Poll Tool

Create `src/mcp/tools/poll.ts`:
```typescript
import { defineTool, ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { EventEntity } from '../../storage/repositories/events.js';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    subscriptionId: {
      type: 'string',
      description: 'Subscription ID to poll from',
    },
    eventTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Event type patterns to filter (overrides subscription filters)',
    },
    timeout: {
      type: 'number',
      description: 'Maximum time to wait for events in seconds (default: 30, max: 120)',
      default: 30,
    },
    limit: {
      type: 'number',
      description: 'Maximum number of events to return (default: 10, max: 100)',
      default: 10,
    },
  },
  required: ['subscriptionId'],
};

// In-memory waiter tracking for blocking polls
// Key: unique waiter ID, Value: waiter info including subscriptionId
const pollWaiters = new Map<string, {
  subscriptionId: string;
  eventTypes: string[];
  filters: Record<string, unknown> | undefined;
  limit: number;
  resolve: (events: EventEntity[]) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}>();

export const pollTool = defineTool(
  'webhooks.poll',
  'Poll for events matching subscription criteria. Supports blocking with timeout.',
  inputSchema,
  async (args) => {
    const { subscriptionId, eventTypes, timeout = 30, limit = 10 } = args;

    if (typeof subscriptionId !== 'string') {
      throw new Error('subscriptionId must be a string');
    }

    // Cap timeout at 2 minutes and limit at 100
    const effectiveTimeout = Math.min(timeout as number, 120) * 1000;
    const effectiveLimit = Math.min(limit as number, 100);

    try {
      const storage = StorageService.getInstance();

      // Verify subscription exists and is active
      const subscription = await storage.subscriptions.findById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      if (!subscription.isActive) {
        throw new Error(`Subscription ${subscriptionId} is not active`);
      }

      if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
        throw new Error(`Subscription ${subscriptionId} has expired`);
      }

      // Determine event types to filter by
      const filterTypes = Array.isArray(eventTypes) && eventTypes.length > 0
        ? eventTypes as string[]
        : subscription.eventTypes;

      // First, check for existing unread events
      const existingEvents = await getMatchingEvents(
        storage,
        subscriptionId,
        filterTypes,
        subscription.filters,
        effectiveLimit
      );

      if (existingEvents.length > 0) {
        // Mark events as delivered and return immediately
        await markEventsDelivered(storage, subscriptionId, existingEvents);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              events: existingEvents.map(e => formatEvent(e)),
              hasMore: existingEvents.length === effectiveLimit,
              waited: false,
            }, null, 2),
          }],
        };
      }

      // No existing events - set up blocking wait
      return await blockingPoll(
        storage,
        subscriptionId,
        filterTypes,
        subscription.filters,
        effectiveTimeout,
        effectiveLimit
      );

    } catch (error) {
      logger.error({ error, event: 'poll_error', subscriptionId }, 'Poll failed');
      throw new Error(`Poll failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

async function blockingPoll(
  storage: StorageService,
  subscriptionId: string,
  eventTypes: string[],
  filters: Record<string, unknown> | undefined,
  timeout: number,
  limit: number
): Promise<{ content: unknown[] }> {
  const waiterId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pollWaiters.delete(waiterId);
      resolve({
        content: [{
          type: 'text',
          text: JSON.stringify({
            events: [],
            hasMore: false,
            waited: true,
            timedOut: true,
          }, null, 2),
        }],
      });
    }, timeout);

    pollWaiters.set(waiterId, {
      subscriptionId,
      eventTypes,
      filters,
      limit,
      resolve: (events: EventEntity[]) => {
        clearTimeout(timeoutId);
        pollWaiters.delete(waiterId);
        resolve({
          content: [{
            type: 'text',
            text: JSON.stringify({
              events: events.map(e => formatEvent(e)),
              hasMore: events.length === limit,
              waited: true,
              timedOut: false,
            }, null, 2),
          }],
        });
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        pollWaiters.delete(waiterId);
        reject(error);
      },
      timeout: timeoutId,
    });
  });
}

// Called when new events arrive - notifies waiting polls
export async function notifyPollWaiters(
  event: EventEntity,
  storage: StorageService
): Promise<void> {
  for (const [waiterId, waiter] of pollWaiters.entries()) {
    // Check if this event matches the waiter's criteria
    const typeMatch = waiter.eventTypes.some(pattern => matchEventType(pattern, event.type));
    if (!typeMatch) continue;

    // Check filters
    if (waiter.filters && Object.keys(waiter.filters).length > 0) {
      if (!matchesFilters(event, waiter.filters)) continue;
    }

    // Fetch matching events up to the waiter's limit
    const events = await getMatchingEvents(
      storage,
      waiter.subscriptionId,
      waiter.eventTypes,
      waiter.filters,
      waiter.limit
    );

    if (events.length > 0) {
      await markEventsDelivered(storage, waiter.subscriptionId, events);
      waiter.resolve(events);
    }
  }
}

function matchEventType(pattern: string, eventType: string): boolean {
  if (pattern === '*') return true;
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return regex.test(eventType);
  }
  return pattern === eventType;
}

function matchesFilters(event: EventEntity, filters: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filters)) {
    const eventValue = event.data[key] ?? event[key as keyof EventEntity];
    if (eventValue !== value) {
      return false;
    }
  }
  return true;
}

async function markEventsDelivered(
  storage: StorageService,
  subscriptionId: string,
  events: EventEntity[]
): Promise<void> {
  const deliveredAt = new Date().toISOString();

  for (const event of events) {
    await storage.subscriptionEvents.create({
      subscriptionId,
      eventId: event.id,
      deliveredAt,
    });
  }
}

function formatEvent(event: EventEntity): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    sourceType: event.sourceType,
    timestamp: event.timestamp,
    correlationId: event.correlationId,
    data: event.data,
  };
}
```

### 4. History Tool

Create `src/mcp/tools/history.ts`:
```typescript
import { defineTool, ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    eventTypes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by event types',
    },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by sources (e.g., "stripe", "github")',
    },
    startTime: {
      type: 'string',
      description: 'Start time in ISO 8601 format',
    },
    endTime: {
      type: 'string',
      description: 'End time in ISO 8601 format',
    },
    correlationId: {
      type: 'string',
      description: 'Filter by correlation ID for tracing',
    },
    limit: {
      type: 'number',
      description: 'Page size (default: 50, max: 100)',
      default: 50,
    },
    cursor: {
      type: 'string',
      description: 'Pagination cursor for next page (base64 encoded timestamp+id)',
    },
  },
};

export const historyTool = defineTool(
  'webhooks.history',
  'Query historical webhook events with pagination and filtering.',
  inputSchema,
  async (args) => {
    const {
      eventTypes,
      sources,
      startTime,
      endTime,
      correlationId,
      limit = 50,
      cursor,
    } = args;

    // Validate and cap limit
    const effectiveLimit = Math.min(limit as number, 100);

    try {
      const storage = StorageService.getInstance();

      // Decode cursor if present
      let lastTimestamp: string | undefined;
      let lastId: string | undefined;
      
      if (cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
          lastTimestamp = decoded.t;
          lastId = decoded.i;
        } catch {
          throw new Error('Invalid cursor format');
        }
      }

      // Build query
      const events = await storage.events.list({
        types: Array.isArray(eventTypes) ? eventTypes as string[] : undefined,
        sources: Array.isArray(sources) ? sources as string[] : undefined,
        startTime: startTime as string | undefined,
        endTime: endTime as string | undefined,
        correlationId: correlationId as string | undefined,
        limit: effectiveLimit + 1, // Get one extra to check for more
        orderBy: 'timestamp',
        order: 'DESC',
      });

      // Check if there are more results
      const hasMore = events.length > effectiveLimit;
      const pageEvents = events.slice(0, effectiveLimit);

      // Generate next cursor if there are more results
      let nextCursor: string | null = null;
      if (hasMore && pageEvents.length > 0) {
        const lastEvent = pageEvents[pageEvents.length - 1];
        nextCursor = Buffer.from(JSON.stringify({
          t: lastEvent.timestamp,
          i: lastEvent.id,
        })).toString('base64');
      }

      logger.info({
        event: 'history_query',
        count: pageEvents.length,
        hasMore,
        eventTypes,
        sources,
      }, 'History query executed');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            events: pageEvents.map(e => ({
              id: e.id,
              type: e.type,
              source: e.source,
              sourceType: e.sourceType,
              timestamp: e.timestamp,
              receivedAt: e.receivedAt,
              correlationId: e.correlationId,
              data: e.data,
            })),
            hasMore,
            nextCursor,
            count: pageEvents.length,
          }, null, 2),
        }],
      };

    } catch (error) {
      logger.error({ error, event: 'history_error' }, 'History query failed');
      throw new Error(`History query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
```

### 5. Register Tool

Create `src/mcp/tools/register.ts`:
```typescript
import { defineTool, ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';
import { getWebhookSource } from '../../webhooks/sources/index.js';
import { config } from '../../config.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Unique name for this webhook source (e.g., "stripe-production")',
    },
    sourceType: {
      type: 'string',
      enum: ['stripe', 'github', 'replicate', 'twilio', 'generic'],
      description: 'Type of webhook source',
    },
    signingSecret: {
      type: 'string',
      description: 'Webhook signing secret from the provider',
    },
    webhookUrl: {
      type: 'string',
      description: 'Public URL where webhooks should be sent (optional, auto-generated if not provided)',
    },
  },
  required: ['name', 'sourceType', 'signingSecret'],
};

export const registerTool = defineTool(
  'webhooks.register',
  'Register a new webhook source to receive events from external services.',
  inputSchema,
  async (args) => {
    const { name, sourceType, signingSecret, webhookUrl } = args;

    // Validate source type is supported
    const webhookSource = getWebhookSource(sourceType as string);
    if (!webhookSource) {
      throw new Error(`Unsupported webhook source type: ${sourceType}. Supported: stripe, github, replicate, twilio, generic`);
    }

    // Validate signing secret
    if (typeof signingSecret !== 'string' || signingSecret.length < 8) {
      throw new Error('signingSecret must be at least 8 characters');
    }

    try {
      const storage = StorageService.getInstance();

      // Check if name already exists
      const existing = await storage.sources.findByName(name as string);
      if (existing) {
        throw new Error(`Webhook source "${name}" already exists`);
      }

      // Generate webhook URL if not provided
      const endpointUrl = webhookUrl as string ?? `${config.webhookBaseUrl}/webhooks/${name}`;

      // Encrypt the signing secret
      const encryptedSecret = await encryptSecret(signingSecret as string);

      // Create the source (id and createdAt are generated by repository)
      const source = await storage.sources.create({
        name: name as string,
        sourceType: sourceType as string,
        endpointUrl,
        signingSecret: encryptedSecret,
        isActive: true,
      });

      logger.info({
        event: 'source_registered',
        name: source.name,
        sourceType: source.sourceType,
        endpointUrl: source.endpointUrl,
      }, 'Webhook source registered');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: source.name,
            sourceType: source.sourceType,
            endpointUrl: source.endpointUrl,
            webhookInstructions: `Configure your ${sourceType} webhook to send events to: ${endpointUrl}`,
            nextSteps: [
              '1. Configure the webhook URL in your provider\'s dashboard',
              '2. Use webhooks.subscribe to start receiving events',
              '3. Use webhooks.poll to retrieve events',
            ],
          }, null, 2),
        }],
      };

    } catch (error) {
      logger.error({ error, event: 'register_error' }, 'Failed to register webhook source');
      throw new Error(`Failed to register webhook source: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

async function encryptSecret(secret: string): Promise<string> {
  // TODO: Implement AES-256-GCM encryption using ENCRYPTION_KEY from config
  // For scaffolding, return as-is (implement in security-hardening phase)
  return secret;
}
```

### 6. Unsubscribe Tool

Create `src/mcp/tools/unsubscribe.ts`:
```typescript
import { defineTool, ToolInputSchema } from '../types.js';
import { StorageService } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    subscriptionId: {
      type: 'string',
      description: 'Subscription ID to cancel',
    },
  },
  required: ['subscriptionId'],
};

export const unsubscribeTool = defineTool(
  'webhooks.unsubscribe',
  'Cancel an active event subscription.',
  inputSchema,
  async (args) => {
    const { subscriptionId } = args;

    if (typeof subscriptionId !== 'string') {
      throw new Error('subscriptionId must be a string');
    }

    try {
      const storage = StorageService.getInstance();

      // Check if subscription exists
      const subscription = await storage.subscriptions.findById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      // Deactivate the subscription
      await storage.subscriptions.update(subscriptionId, { isActive: false });

      logger.info({
        event: 'subscription_cancelled',
        subscriptionId,
      }, 'Subscription cancelled');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            subscriptionId,
            status: 'cancelled',
            message: 'Subscription has been cancelled. No more events will be delivered.',
          }, null, 2),
        }],
      };

    } catch (error) {
      logger.error({ error, event: 'unsubscribe_error', subscriptionId }, 'Failed to unsubscribe');
      throw new Error(`Failed to unsubscribe: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
```

### 7. Tool Registration

Create `src/mcp/tools/index.ts`:
```typescript
import { MCPServer } from '../server.js';
import { subscribeTool } from './subscribe.js';
import { pollTool } from './poll.js';
import { historyTool } from './history.js';
import { registerTool } from './register.js';
import { unsubscribeTool } from './unsubscribe.js';

export function registerAllTools(server: MCPServer): void {
  server.registerTool(subscribeTool);
  server.registerTool(pollTool);
  server.registerTool(historyTool);
  server.registerTool(registerTool);
  server.registerTool(unsubscribeTool);
}

export { subscribeTool } from './subscribe.js';
export { pollTool, notifyPollWaiters } from './poll.js';
export { historyTool } from './history.js';
export { registerTool } from './register.js';
export { unsubscribeTool } from './unsubscribe.js';
```

### 8. Main Entry Point

Create `src/mcp/index.ts`:
```typescript
import { MCPServer } from './server.js';
import { registerAllTools } from './tools/index.js';
import { StorageService } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export async function startMCPServer(): Promise<MCPServer> {
  // Initialize storage
  const storage = StorageService.getInstance();
  await storage.initialize();

  // Create and configure MCP server
  const server = new MCPServer();
  registerAllTools(server);

  // Connect based on transport type
  if (config.mcpTransport === 'sse') {
    // SSE requires an existing HTTP server; pass it from src/server.ts
    // Example: await server.connectSSE('/mcp/sse', httpServer);
    throw new Error('SSE transport requires HTTP server instance. Use stdio or implement SSE setup in src/server.ts');
  } else {
    await server.connectStdio();
  }

  logger.info({ transport: config.mcpTransport }, 'MCP server started');

  return server;
}
```

## Testing MCP Tools

Create `tests/mcp/tools.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPServer } from '../../src/mcp/server.js';
import { subscribeTool } from '../../src/mcp/tools/subscribe.js';
import { pollTool } from '../../src/mcp/tools/poll.js';
import { historyTool } from '../../src/mcp/tools/history.js';
import { StorageService } from '../../src/storage/index.js';

describe('MCP Tools', () => {
  let server: MCPServer;
  let storage: StorageService;

  beforeEach(async () => {
    storage = StorageService.getInstance();
    await storage.initialize();
    
    server = new MCPServer();
  });

  afterEach(async () => {
    await server.disconnect();
    await storage.shutdown();
  });

  describe('subscribe tool', () => {
    it('should create a subscription with valid event types', async () => {
      const result = await subscribeTool.execute({
        eventTypes: ['payment.completed', 'payment.failed'],
        ttl: 3600,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.subscriptionId).toBeDefined();
      expect(response.eventTypes).toEqual(['payment.completed', 'payment.failed']);
    });

    it('should reject empty event types', async () => {
      await expect(subscribeTool.execute({
        eventTypes: [],
      })).rejects.toThrow('eventTypes must be a non-empty array');
    });
  });

  describe('history tool', () => {
    it('should return empty results when no events exist', async () => {
      const result = await historyTool.execute({
        limit: 10,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.events).toEqual([]);
      expect(response.hasMore).toBe(false);
    });

    it('should respect limit parameter', async () => {
      const result = await historyTool.execute({
        limit: 5,
      });

      const response = JSON.parse(result.content[0].text as string);
      expect(response.events.length).toBeLessThanOrEqual(5);
    });
  });
});
```

## Best Practices

1. **Validate all inputs** using Zod schemas before processing
2. **Return structured responses** with consistent formatting
3. **Log all tool executions** with appropriate detail levels
4. **Handle errors gracefully** with informative error messages
5. **Implement timeouts** for blocking operations
6. **Use pagination** for large result sets
7. **Test with real MCP clients** (Claude Desktop, etc.)
8. **Document tool schemas** clearly for AI consumption
9. **Implement proper cleanup** for long-running operations
10. **Monitor tool performance** and optimize hot paths

## Related Skills

- **webhook-integration**: Provides event data for MCP tools
- **database-design**: Storage layer for events and subscriptions
- **security-hardening**: Secure handling of sensitive operations
- **testing-strategy**: Comprehensive testing for MCP tools

## Dependencies

This skill requires:
- Architecture setup (project structure)
- Database design (event and subscription storage)
- Webhook integration (event ingestion)

It enables:
- Full MCP server functionality
- Agent interaction with webhook events
- Complete async event handling for AI agents
