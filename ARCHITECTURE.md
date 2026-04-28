# Architecture: webhook-relay-mcp

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              webhook-relay-mcp                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │   External   │    │    HTTP      │    │     MCP      │    │    MCP     │ │
│  │   Services   │───▶│  Webhook     │───▶│   Server     │◀──▶│   Clients  │ │
│  │ (Stripe,     │    │  Ingestion   │    │  (Stdio/     │    │  (Agents)  │ │
│  │  GitHub,     │    │  Endpoint    │    │   SSE)       │    │            │ │
│  │  Replicate)  │    │              │    │              │    │            │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └────────────┘ │
│         │                    │                   │                           │
│         │                    ▼                   │                           │
│         │            ┌──────────────┐           │                           │
│         │            │  Signature   │           │                           │
│         │            │  Validator   │           │                           │
│         │            └──────────────┘           │                           │
│         │                    │                   │                           │
│         │                    ▼                   │                           │
│         │            ┌──────────────┐           │                           │
│         │            │  Payload     │           │                           │
│         │            │  Normalizer  │           │                           │
│         │            └──────────────┘           │                           │
│         │                    │                   │                           │
│         │                    ▼                   │                           │
│         │            ┌──────────────┐           │                           │
│         │            │   SQLite     │◀──────────┘                           │
│         │            │   Database   │                                       │
│         │            └──────────────┘                                       │
│         └───────────────────────────────────────────────────────────────────┘
│                           (Webhook ingress only)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. HTTP Webhook Ingestion Layer

The HTTP server handles incoming webhooks from external services.

```typescript
// src/webhooks/ingest.ts
interface WebhookIngestionRequest {
  source: string;           // e.g., "stripe", "github", "replicate"
  rawBody: Buffer;
  headers: Record<string, string>;
  query: Record<string, string>;
  timestamp: Date;
}

interface WebhookIngestionResponse {
  accepted: boolean;
  eventId: string;
  message?: string;
}
```

**Key Responsibilities:**
- Accept POST requests at `/webhooks/:name` where `:name` is the registered webhook source name (e.g., `stripe-production`)
- Extract signature from headers
- Pass to signature validator
- Forward to normalizer on success
- Return 202 Accepted on success, 401/403 on failure

**Routing Note**: The URL parameter is the registered `name` field from `webhook_sources`, not the `source_type`. This allows multiple configurations per source type (e.g., `stripe-test` and `stripe-production`).

---

### 2. Signature Validation Layer

Pluggable signature validators for each webhook source.

```typescript
// src/webhooks/validator.ts
interface SignatureValidator {
  /**
   * Validates the signature of an incoming webhook.
   * @throws {SignatureVerificationError} if validation fails
   */
  validate(payload: Buffer, signature: string, secret: string): Promise<boolean>;
}

// Source-specific implementations
class StripeSignatureValidator implements SignatureValidator {
  validate(payload: Buffer, signature: string, secret: string): Promise<boolean>;
}

class GitHubSignatureValidator implements SignatureValidator {
  validate(payload: Buffer, signature: string, secret: string): Promise<boolean>;
}

class TwilioSignatureValidator implements SignatureValidator {
  validate(url: string, payload: Buffer, signature: string, authToken: string): Promise<boolean>;
}
```

**Validation Flow:**
```
Incoming Request
      │
      ▼
┌─────────────────┐
│ Extract Source  │ ─── Determine validator type
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Get Secret from │ ─── Lookup registered source config
│ Source Config   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Run Validator   │ ─── HMAC-SHA256, RSA, etc.
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
   Yes        No
    │         │
    ▼         ▼
┌───────┐ ┌─────────┐
│ Pass  │ │ Reject  │ ─── Log, alert, return 401
└───────┘ └─────────┘
```

---

### 3. Payload Normalization Layer

Transforms source-specific payloads into a unified event schema.

```typescript
  // src/webhooks/types.ts

/**
 * Normalized event schema - all webhooks are converted to this format
 */
interface NormalizedEvent {
  /** Unique event identifier (ULID) */
  id: string;
  
  /** Event type in normalized format (e.g., "payment.completed", "build.started") */
  type: string;
  
  /** Original source (e.g., "stripe", "github", "replicate") */
  source: string;
  
  /** Original event type from source (e.g., "invoice.payment_succeeded") */
  sourceType: string;
  
  /** When the event occurred at the source */
  timestamp: string;  // ISO 8601
  
  /** When this event was received and normalized */
  receivedAt: string;  // ISO 8601
  
  /** Correlation ID for tracing across systems */
  correlationId?: string;
  
  /** The normalized payload data */
  data: Record<string, unknown>;
  
  /** Raw original payload for debugging/replay */
  rawPayload: unknown;
  
  /** Source-specific metadata */
  metadata: {
    webhookId?: string;
    attemptNumber?: number;
    [key: string]: unknown;
  };
}

/**
 * Payload normalizer interface
 */
interface PayloadNormalizer {
  normalize(rawPayload: unknown, context: NormalizationContext): Promise<NormalizedEvent>;
}

interface NormalizationContext {
  source: string;
  sourceType: string;
  headers: Record<string, string>;
  receivedAt: Date;
}
```

**Type Mapping Example:**
```typescript
// src/webhooks/sources/stripe.ts

const STRIPE_TYPE_MAP: Record<string, string> = {
  'invoice.payment_succeeded': 'payment.completed',
  'invoice.payment_failed': 'payment.failed',
  'customer.subscription.created': 'subscription.created',
  'customer.subscription.deleted': 'subscription.deleted',
  'checkout.session.completed': 'checkout.completed',
};

class StripeNormalizer implements PayloadNormalizer {
  normalize(rawPayload: unknown, context: NormalizationContext): Promise<NormalizedEvent> {
    const stripeEvent = rawPayload as StripeEvent;
    const normalizedType = STRIPE_TYPE_MAP[stripeEvent.type] ?? `stripe.${stripeEvent.type}`;
    
    return {
      id: generateULID(),
      type: normalizedType,
      source: 'stripe',
      sourceType: stripeEvent.type,
      timestamp: new Date(stripeEvent.created * 1000).toISOString(),
      receivedAt: context.receivedAt.toISOString(),
      correlationId: stripeEvent.data.object.id,
      data: {
        customerId: stripeEvent.data.object.customer,
        amount: stripeEvent.data.object.amount_due,
        currency: stripeEvent.data.object.currency,
        status: stripeEvent.type.includes('succeeded') ? 'completed' : 'failed',
      },
      rawPayload,
      metadata: {
        webhookId: stripeEvent.id,
        apiVersion: stripeEvent.api_version,
      },
    };
  }
}
```

---

### 4. Storage Layer

SQLite-based persistent storage with repository pattern.

```typescript
// src/storage/database.ts

/**
 * Database schema
 */
const SCHEMA = `
  -- Registered webhook sources
  CREATE TABLE webhook_sources (
    id TEXT PRIMARY KEY,              -- ULID
    name TEXT NOT NULL UNIQUE,         -- e.g., "stripe-production"
    source_type TEXT NOT NULL,         -- e.g., "stripe"
    endpoint_url TEXT NOT NULL,        -- Public URL for receiving webhooks
    signing_secret TEXT NOT NULL,      -- Encrypted at rest
    is_active INTEGER DEFAULT 1,  -- BOOLEAN: 1 = true, 0 = false
    created_at TEXT NOT NULL,          -- ISO 8601
    updated_at TEXT NOT NULL           -- ISO 8601
  );

  -- Normalized events
  CREATE TABLE events (
    id TEXT PRIMARY KEY,               -- ULID
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,           -- FK to webhook_sources.id
    timestamp TEXT NOT NULL,           -- ISO 8601
    received_at TEXT NOT NULL,         -- ISO 8601
    correlation_id TEXT,
    data TEXT NOT NULL,                -- JSON
    raw_payload TEXT NOT NULL,         -- JSON
    metadata TEXT,                     -- JSON
    processed INTEGER DEFAULT 0,  -- BOOLEAN: 1 = true, 0 = false
    created_at TEXT NOT NULL           -- ISO 8601
  );

  -- Event subscriptions
  CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,               -- ULID
    event_types TEXT NOT NULL,         -- JSON array of patterns
    filters TEXT,                      -- JSON filter conditions
    created_at TEXT NOT NULL,          -- ISO 8601
    expires_at TEXT,                   -- ISO 8601, nullable
    is_active INTEGER DEFAULT 1   -- BOOLEAN: 1 = true, 0 = false
  );

  -- Subscription event delivery tracking
  CREATE TABLE subscription_events (
    id TEXT PRIMARY KEY,               -- ULID
    subscription_id TEXT NOT NULL,     -- FK to subscriptions.id
    event_id TEXT NOT NULL,            -- FK to events.id
    delivered_at TEXT,                 -- ISO 8601 when delivered to subscriber
    read_at TEXT,                      -- ISO 8601 when consumer acknowledged via poll
    created_at TEXT NOT NULL           -- ISO 8601
  );

  -- Indexes for performance
  CREATE INDEX idx_events_type ON events(type);
  CREATE INDEX idx_events_source ON events(source);
  CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX idx_events_received_at ON events(received_at DESC);
  CREATE INDEX idx_events_source_type ON events(source, type);
  CREATE INDEX idx_events_correlation ON events(correlation_id) WHERE correlation_id IS NOT NULL;
  CREATE INDEX idx_subscription_events_subscription ON subscription_events(subscription_id);
  CREATE INDEX idx_subscription_events_event ON subscription_events(event_id);
  CREATE INDEX idx_subscription_events_unread ON subscription_events(subscription_id, read_at) 
    WHERE read_at IS NULL;
`;
```

**Repository Pattern:**
```typescript
// src/storage/repositories/events.ts

interface EventRepository {
  create(event: NormalizedEvent, sourceId: string): Promise<void>;
  findById(id: string): Promise<NormalizedEvent | null>;
  findByType(type: string, options?: QueryOptions): Promise<NormalizedEvent[]>;
  findByCorrelationId(correlationId: string): Promise<NormalizedEvent[]>;
  findUnprocessed(limit?: number): Promise<NormalizedEvent[]>;
  markProcessed(id: string): Promise<void>;
}

// src/storage/repositories/subscriptions.ts

interface SubscriptionRepository {
  create(subscription: Subscription): Promise<Subscription>;
  findById(id: string): Promise<Subscription | null>;
  findActive(): Promise<Subscription[]>;
  findByEventType(eventType: string): Promise<Subscription[]>;
  update(subscription: Subscription): Promise<void>;
  delete(id: string): Promise<void>;
}
```

---

### 5. MCP Server Layer

Implements the Model Context Protocol server with tools for agent interaction.

```typescript
// src/index.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'webhook-relay-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'webhooks.subscribe',
      description: 'Subscribe to webhook events matching specified criteria',
      inputSchema: {
        type: 'object',
        properties: {
          eventTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Event type patterns to subscribe to (supports wildcards)',
          },
          filters: {
            type: 'object',
            description: 'Additional filter conditions',
          },
          ttl: {
            type: 'number',
            description: 'Subscription TTL in seconds (default: 3600)',
          },
        },
        required: ['eventTypes'],
      },
    },
    {
      name: 'webhooks.poll',
      description: 'Poll for events matching criteria, with optional blocking',
      inputSchema: {
        type: 'object',
        properties: {
          subscriptionId: {
            type: 'string',
            description: 'Subscription ID to poll from',
          },
          eventTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Event type patterns to filter',
          },
          timeout: {
            type: 'number',
            description: 'Maximum time to wait for events in seconds (default: 30)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of events to return (default: 10)',
          },
        },
      },
    },
    {
      name: 'webhooks.history',
      description: 'Query historical events with pagination',
      inputSchema: {
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
            description: 'Filter by sources',
          },
          startTime: {
            type: 'string',
            description: 'Start time (ISO 8601)',
          },
          endTime: {
            type: 'string',
            description: 'End time (ISO 8601)',
          },
          correlationId: {
            type: 'string',
            description: 'Filter by correlation ID',
          },
          limit: {
            type: 'number',
            description: 'Page size (default: 50, max: 100)',
          },
          cursor: {
            type: 'string',
            description: 'Pagination cursor for next page',
          },
        },
      },
    },
    {
      name: 'webhooks.register',
      description: 'Register a new webhook source',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Unique name for this webhook source',
          },
          sourceType: {
            type: 'string',
            enum: ['stripe', 'github', 'replicate', 'twilio', 'generic'],
            description: 'Type of webhook source',
          },
          signingSecret: {
            type: 'string',
            description: 'Webhook signing secret',
          },
          webhookUrl: {
            type: 'string',
            description: 'Public URL for this webhook (optional, auto-generated if omitted)',
          },
        },
        required: ['name', 'sourceType', 'signingSecret'],
      },
    },
    {
      name: 'webhooks.unsubscribe',
      description: 'Cancel an active subscription',
      inputSchema: {
        type: 'object',
        properties: {
          subscriptionId: {
            type: 'string',
            description: 'Subscription ID to cancel',
          },
        },
        required: ['subscriptionId'],
      },
    },
  ],
}));

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'webhooks.subscribe':
      return handleSubscribe(args);
    case 'webhooks.poll':
      return handlePoll(args);
    case 'webhooks.history':
      return handleHistory(args);
    case 'webhooks.register':
      return handleRegister(args);
    case 'webhooks.unsubscribe':
      return handleUnsubscribe(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('webhook-relay-mcp server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

---

### 6. Event Routing Engine

Matches incoming events to active subscriptions.

```typescript
// src/routing/engine.ts

interface RoutingEngine {
  /**
   * Match an event against all active subscriptions
   */
  match(event: NormalizedEvent): Promise<Subscription[]>;
  
  /**
   * Deliver event to matching subscriptions
   */
  deliver(event: NormalizedEvent, subscriptions: Subscription[]): Promise<void>;
}

interface SubscriptionMatcher {
  /**
   * Check if an event matches subscription criteria
   */
  matches(event: NormalizedEvent, subscription: Subscription): boolean;
}

/**
 * Event type pattern matching with wildcard support
 * Patterns: "payment.*", "stripe.*", "payment.completed"
 */
function matchEventType(pattern: string, eventType: string): boolean {
  if (pattern === '*') return true;
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return regex.test(eventType);
  }
  return pattern === eventType;
}
```

---

## Data Flow

### Webhook Ingestion Flow

```
1. External Service (e.g., Stripe) sends POST to /webhooks/stripe
                    │
                    ▼
2. ┌─────────────────────────────────────────────────────────┐
   │ HTTP Server receives request                             │
   │ - Extract source from URL path                           │
   │ - Parse headers and body                                 │
   │ - Generate request ID for tracing                        │
   └────────────────────────┬────────────────────────────────┘
                            │
                            ▼
3. ┌─────────────────────────────────────────────────────────┐
   │ Signature Validation                                     │
   │ - Look up source configuration                           │
   │ - Extract signature from header                          │
   │ - Validate using source-specific validator               │
   │ - On failure: log, alert, return 401                     │
   └────────────────────────┬────────────────────────────────┘
                            │
                     ┌──────┴──────┐
                     │             │
                   Valid         Invalid
                     │             │
                     ▼             ▼
4. ┌──────────────────────┐  ┌──────────┐
   │ Payload Normalization │  │ Return 401│
   │ - Parse raw payload   │  └──────────┘
   │ - Map event type      │
   │ - Extract key data    │
   │ - Create NormalizedEvent
   └────────────────────────┬────────────────────────────────┘
                            │
                            ▼
5. ┌─────────────────────────────────────────────────────────┐
   │ Store Event                                              │
   │ - Insert into events table                               │
   │ - Store raw payload for replay                           │
   │ - Generate correlation ID if missing                     │
   └────────────────────────┬────────────────────────────────┘
                            │
                            ▼
6. ┌─────────────────────────────────────────────────────────┐
   │ Route to Subscriptions                                   │
   │ - Match event against active subscriptions               │
   │ - Create subscription_event records                      │
   │ - Notify waiting pollers (via condition variable)        │
   └────────────────────────┬────────────────────────────────┘
                            │
                            ▼
7. ┌─────────────────────────────────────────────────────────┐
   │ Return 202 Accepted                                      │
   │ - Include event ID in response                           │
   │ - External service considers webhook delivered           │
   └─────────────────────────────────────────────────────────┘
```

### Agent Polling Flow

```
1. Agent calls webhooks.poll({ eventTypes: ["payment.completed"], timeout: 30 })
                    │
                    ▼
2. ┌─────────────────────────────────────────────────────────┐
   │ Check for existing matching events                       │
   │ - Query events table for matches                         │
   │ - If found: return immediately                           │
   └────────────────────────┬────────────────────────────────┘
                            │
                     ┌──────┴──────┐
                     │             │
                  Found          Empty
                     │             │
                     ▼             ▼
              ┌──────────┐  ┌──────────────────────┐
              │ Return   │  │ Register waiter      │
              │ events   │  │ - Add to waiters map │
              └──────────┘  │ - Set timeout        │
                            │ - Wait on condition  │
                            └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │ Block until:         │
                            │ - Event arrives      │
                            │ - Timeout expires    │
                            │ - Max wait reached   │
                            └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │ Return events (may   │
                            │ be empty on timeout) │
                            └──────────────────────┘
```

---

## API Design

### HTTP Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/:source` | Receive webhook from external service |
| GET | `/health` | Health check endpoint |
| GET | `/webhooks/:source/verify` | Verify webhook endpoint (for setup) |

### MCP Tools

#### `webhooks.subscribe`

```json
{
  "name": "webhooks.subscribe",
  "arguments": {
    "eventTypes": ["payment.*", "replicate.predictions.completed"],
    "filters": {
      "source": "stripe"
    },
    "ttl": 3600
  }
}
```

**Response:**
```json
{
  "subscriptionId": "01HRF8K2M3N4P5Q6R7S8T9V0W1",
  "eventTypes": ["payment.*", "replicate.predictions.completed"],
  "expiresAt": "2024-01-15T12:00:00.000Z"
}
```

#### `webhooks.poll`

```json
{
  "name": "webhooks.poll",
  "arguments": {
    "subscriptionId": "01HRF8K2M3N4P5Q6R7S8T9V0W1",
    "timeout": 30,
    "limit": 10
  }
}
```

**Response:**
```json
{
  "events": [
    {
      "id": "01HRF8K2M3N4P5Q6R7S8T9V0W2",
      "type": "payment.completed",
      "source": "stripe",
      "timestamp": "2024-01-15T11:30:00.000Z",
      "data": {
        "customerId": "cus_123",
        "amount": 5000,
        "currency": "usd"
      }
    }
  ],
  "hasMore": false,
  "nextCursor": null
}
```

#### `webhooks.history`

```json
{
  "name": "webhooks.history",
  "arguments": {
    "eventTypes": ["payment.completed"],
    "startTime": "2024-01-14T00:00:00.000Z",
    "endTime": "2024-01-15T23:59:59.999Z",
    "limit": 50
  }
}
```

**Response:**
```json
{
  "events": [...],
  "hasMore": true,
  "nextCursor": "eyJpZCI6IjAxSFJGOEsyTTNO...=="
}
```

---

## Error Handling

Structured error hierarchy for consistent handling across the system:

```typescript
// src/utils/errors.ts

export class WebhookRelayError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SignatureVerificationError extends WebhookRelayError {
  constructor(message: string = 'Signature verification failed') {
    super(message, 'SIGNATURE_VERIFICATION_FAILED');
  }
}

export class ValidationError extends WebhookRelayError {
  constructor(message: string = 'Validation failed') {
    super(message, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends WebhookRelayError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND');
  }
}

export class ConflictError extends WebhookRelayError {
  constructor(message: string = 'Conflict detected') {
    super(message, 'CONFLICT');
  }
}
```

---

## Raw Body Handling

Signature validators require the raw request body. Express's default `express.json()` middleware provides parsed objects, which breaks HMAC verification.

**Solution**: Use `raw-body` to capture the raw buffer before JSON parsing:

```typescript
// Applied before express.json() on webhook routes
app.use('/webhooks/*', rawBodyMiddleware);
```

The middleware stores the raw buffer on `req.rawBody` and manually parses JSON into `req.body` so both are available.

---

## Security Considerations

### 1. Signature Verification

All webhook sources must have signature verification:
- **Stripe**: HMAC-SHA256 with `Stripe-Signature` header
- **GitHub**: HMAC-SHA256 with `X-Hub-Signature-256` header
- **Twilio**: HMAC-SHA1 with `X-Twilio-Signature` header
- **Generic**: Configurable HMAC algorithm

### 2. Secret Management

- Signing secrets encrypted at rest using AES-256-GCM
- Master encryption key from environment variable
- Secrets never logged or exposed in responses

### 3. Rate Limiting

- Per-source rate limits to prevent abuse
- Per-subscription poll limits
- Configurable burst allowances

### 4. Input Validation

- All inputs validated with Zod schemas
- Payload size limits enforced
- SQL injection prevention via parameterized queries

---

## Performance Optimizations

### 1. Database

- WAL mode for concurrent reads/writes
- Connection pooling with better-sqlite3
- Indexed queries for common patterns
- Periodic vacuuming for space reclamation

### 2. Memory

- Event payload streaming for large webhooks
- Bounded waiter queues for polling
- LRU cache for frequently accessed subscriptions

### 3. Networking

- HTTP/2 support for webhook ingestion
- Keep-alive connections
- Compression for large payloads

---

## Extensibility

### Adding a New Webhook Source

1. Create signature validator:
```typescript
// src/webhooks/sources/newsource.ts
export class NewSourceValidator implements SignatureValidator {
  validate(payload: Buffer, signature: string, secret: string): Promise<boolean> {
    // Implementation
  }
}
```

2. Create payload normalizer:
```typescript
export class NewSourceNormalizer implements PayloadNormalizer {
  normalize(rawPayload: unknown, context: NormalizationContext): Promise<NormalizedEvent> {
    // Implementation
  }
}
```

3. Register in source factory:
```typescript
// src/webhooks/sources/index.ts
const SOURCE_FACTORIES = {
  newsource: {
    validator: NewSourceValidator,
    normalizer: NewSourceNormalizer,
  },
};
```

---

## Data Retention

Events are stored in SQLite with a configurable retention policy to prevent unbounded growth.

| Setting | Default | Description |
|---------|---------|-------------|
| `EVENT_RETENTION_DAYS` | 30 | Days to keep events before automatic deletion |
| `RETENTION_BATCH_SIZE` | 1000 | Max events deleted per cleanup run |
| `RETENTION_RUN_INTERVAL_MS` | 86400000 | Cleanup interval (24 hours) |

Cleanup strategy: A background timer runs periodically, deleting events older than `EVENT_RETENTION_DAYS` and their associated `subscription_events` records (via ON DELETE CASCADE).

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Production                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Load      │    │  webhook-   │    │   SQLite    │         │
│  │  Balancer   │───▶│  relay-mcp  │───▶│  (WAL       │         │
│  │             │    │  (xN)       │    │   Mode)     │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                    │                                   │
│         │                    │                                   │
│         ▼                    ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    External Services                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │ Stripe  │  │ GitHub  │  │Replicate│  │ Twilio  │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Horizontal Scaling

- Multiple MCP server instances behind load balancer
- Shared SQLite database (network-attached storage)
- Sticky sessions not required (stateless HTTP layer)
- Polling coordination via database notifications

---

## Monitoring & Observability

### Metrics (Prometheus Format)

| Metric | Type | Description |
|--------|------|-------------|
| `webhook_received_total` | Counter | Total webhooks received by source |
| `webhook_validation_failed_total` | Counter | Failed signature validations |
| `webhook_processing_duration_seconds` | Histogram | Time to process webhook |
| `events_stored_total` | Counter | Total events stored |
| `subscriptions_active` | Gauge | Active subscriptions |
| `poll_requests_total` | Counter | Total poll requests |
| `poll_wait_duration_seconds` | Histogram | Time spent waiting in poll |

### Structured Logging (pino)

```typescript
logger.info({
  event: 'webhook_received',
  source: 'stripe',
  eventType: 'invoice.payment_succeeded',
  webhookId: 'wh_123',
  processingTimeMs: 45,
});
```

### Health Checks

- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe (database connected)
- `GET /health/live` - Liveness probe (server responsive)

---

## Related Projects

- **media-pipeline-mcp** (github.com/reaatech/media-pipeline-mcp): This MCP server handles media processing pipelines. webhook-relay-mcp complements it by handling async webhook notifications from services like Replicate, enabling agents to wait for video/image generation completion without polling.
