# webhook-relay-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-^1.0.4-blue)](https://github.com/modelcontextprotocol/sdk)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that bridges third-party webhooks into agent workflows. Receives webhooks from Stripe, GitHub, Replicate, Twilio, and generic sources, normalizes them into a consistent event format, and exposes them to MCP clients via subscription-based polling.

## Features

- **Multi-source ingestion** — Stripe, GitHub, Replicate, Twilio, and Generic with source-specific handlers
- **Signature validation** — HMAC-SHA256/SHA1 verification with constant-time comparison via `timingSafeEqual`
- **Event normalization** — Source-specific payloads normalized into a unified schema
- **Deduplication** — Ingress-level deduplication by `webhookId` prevents duplicate event storage
- **MCP tools** — 6 tools: `subscribe`, `unsubscribe`, `list`, `poll`, `history`, `register`
- **Dual transport** — stdio (default) for local agent use, HTTP/SSE for remote agent connections
- **SQLite storage** — WAL mode, schema migrations, foreign keys with CASCADE deletes
- **Rate limiting** — In-memory per-IP rate limiting on webhook endpoints
- **Event retention** — Configurable automatic cleanup of stale events
- **Secrets encryption** — Webhook signing secrets encrypted at rest with AES-256-GCM
- **Docker support** — Multi-stage build with health checks and non-root user

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Installation

```bash
pnpm install
pnpm run build
```

### Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `production`, or `test` |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server bind address |
| `DATABASE_PATH` | `./data/webhook-relay.db` | SQLite database file path |
| `ENCRYPTION_KEY` | *(required)* | Master key for encrypting webhook secrets at rest |
| `MCP_TRANSPORT` | `stdio` | `stdio` for local agents, `sse` for HTTP/SSE remote access |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, or `fatal` |
| `LOG_FORMAT` | `json` | `json` for structured output, `pretty` for development |
| `WEBHOOK_BASE_URL` | `http://localhost:3000` | Public-facing base URL for generating webhook endpoint URLs |
| `EVENT_RETENTION_DAYS` | `30` | Days to retain events before automatic cleanup |
| `ADMIN_API_KEY` | *(optional)* | API key for securing the `/admin/cleanup` endpoint |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit sliding window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window per IP |

### Run

**MCP stdio mode** (default, for local agent use):
```bash
pnpm start
```

**HTTP/SSE mode** (for remote agents or multi-client setups):
```bash
MCP_TRANSPORT=sse pnpm start
```

### Docker

```bash
docker compose up --build
```

## MCP Tools

### `webhooks.subscribe`

Create a subscription for event types with optional TTL and filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventTypes` | `string[]` | Yes | Event type patterns (supports `*` wildcard, e.g. `"payment.*"`) |
| `filters` | `object` | No | JSON key-value filters on event payloads |
| `ttl` | `number` | No | Subscription TTL in seconds (default: 3600) |

### `webhooks.unsubscribe`

Cancel an active subscription by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscriptionId` | `string` | Yes | The subscription ID to cancel |

### `webhooks.list`

List subscriptions with optional filtering.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `activeOnly` | `boolean` | No | Return only active subscriptions (default: `true`) |
| `eventTypes` | `string[]` | No | Filter by matching event type patterns |
| `limit` | `number` | No | Max results (default: 50, max: 100) |

### `webhooks.poll`

Poll for events matching a subscription. Supports blocking mode for long-polling.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscriptionId` | `string` | No | Poll from a specific subscription |
| `eventTypes` | `string[]` | No | Event type patterns to match |
| `timeout` | `number` | No | Max wait in seconds (default: 30) |
| `limit` | `number` | No | Max events to return (default: 10) |

### `webhooks.history`

Query historical events with cursor-based pagination.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventTypes` | `string[]` | No | Filter by event types |
| `sources` | `string[]` | No | Filter by source (e.g. `"stripe"`, `"github"`) |
| `startTime` | `string` | No | ISO 8601 start timestamp |
| `endTime` | `string` | No | ISO 8601 end timestamp |
| `correlationId` | `string` | No | Filter by correlation ID |
| `limit` | `number` | No | Page size (default: 50, max: 100) |
| `cursor` | `string` | No | Pagination cursor for next page |

### `webhooks.register`

Register a new webhook source configuration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Unique name for this source (e.g. `"stripe-production"`) |
| `sourceType` | `string` | Yes | One of: `stripe`, `github`, `replicate`, `twilio`, `generic` |
| `signingSecret` | `string` | Yes | Webhook signing secret (encrypted at rest) |
| `webhookUrl` | `string` | No | Custom endpoint URL (auto-generated from `WEBHOOK_BASE_URL` if omitted) |

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Basic health check with version |
| `GET` | `/health/ready` | Readiness probe |
| `POST` | `/admin/cleanup` | Trigger event retention cleanup (requires `ADMIN_API_KEY` in production) |
| `POST` | `/webhooks/:name` | Ingest webhook for a registered source (`:name` = registered source name) |
| `GET` | `/webhooks/:name/verify` | Webhook verification handshake (hub challenge) |
| `POST` | `/mcp` | MCP HTTP/SSE transport endpoint (initialize sessions) |
| `GET` | `/mcp` | MCP HTTP/SSE transport (streaming GET) |
| `DELETE` | `/mcp` | MCP HTTP/SSE transport (session termination) |

> **Note:** The webhook ingestion path uses the registered source *name* (e.g. `stripe-production`), not the source type. This allows multiple configurations per source type (e.g. `stripe-test` and `stripe-production`).

## Supported Webhook Sources

### Stripe

- Validates `Stripe-Signature` header (v1 scheme with timestamp tolerance of 5 minutes)
- Event type mapping: `invoice.payment_succeeded` → `payment.completed`, `customer.subscription.created` → `subscription.created`, etc.

### GitHub

- Validates `X-Hub-Signature-256` header (HMAC-SHA256)
- Combines `X-GitHub-Event` header with payload `action` field for event type

### Replicate

- Optional signature validation via `webhook-secret` header
- Derives event type from payload `status` field

### Twilio

- HMAC-SHA1 validation of the full request URL with sorted form params
- Separate event type mapping for SMS and Voice status callbacks

### Generic

- Configurable HMAC algorithm via `x-signature-algorithm` header
- Pass-through normalization (preserves original payload structure)

## Architecture

```
                     ┌──────────────────────────────────────────┐
                     │          webhook-relay-mcp                 │
                     │                                            │
  External Services  │  ┌─────────┐  ┌───────────┐  ┌─────────┐ │  ┌───────────┐
  ┌──────────────┐   │  │ Express │  │ Signature │  │         │ │  │   MCP     │
  │    Stripe    │───┼─▶│ HTTP    │─▶│ Validator │─▶│ SQLite  │ │  │  Clients  │
  │    GitHub    │───┼─▶│ Server  │  │           │  │ (WAL)   │◀┼─▶│ (Agents)  │
  │  Replicate   │───┼─▶│         │  │ Normalize │  │         │ │  │           │
  │   Twilio     │───┼─▶│ /webhooks│  └───────────┘  └─────────┘ │  │  stdio or │
  │   Generic    │───┼─▶│ /:name   │                     │       │  │  HTTP/SSE │
  └──────────────┘   │  └─────────┘                     │       │  └───────────┘
                     │                                   │       │
                     │                    ┌──────────────┘       │
                     │                    ▼                      │
                     │              ┌───────────┐               │
                     │              │  In-Memory │               │
                     │              │  Poll      │               │
                     │              │  Waiters   │               │
                     │              └───────────┘               │
                     └──────────────────────────────────────────┘
```

**Data flow**: External webhook → signature validation → payload normalization → deduplication check → SQLite storage → notify matching poll waiters → MCP clients receive events.

## Development

```bash
# Start dev server with hot reload
pnpm run dev

# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage report
pnpm run test:coverage

# Run all quality checks
pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build

# Format code
pnpm run format

# Check formatting (CI)
pnpm run format:check
```

### Project Structure

```
src/
├── index.ts                  # Entry point, transport dispatch
├── server.ts                 # Express HTTP server setup
├── config.ts                 # Zod-validated environment configuration
├── mcp/                      # MCP protocol layer
│   ├── index.ts              # MCP start logic (stdio / HTTP-SSE)
│   ├── server.ts             # MCP server wrapper
│   ├── types.ts              # Tool type definitions
│   └── tools/                # Tool implementations
│       ├── subscribe.ts
│       ├── unsubscribe.ts
│       ├── list.ts
│       ├── poll.ts
│       ├── history.ts
│       └── register.ts
├── webhooks/                 # Webhook processing pipeline
│   ├── ingest.ts             # HTTP endpoint router
│   ├── types.ts              # Event schema types
│   ├── validators/           # Signature validators
│   └── sources/              # Per-source handlers
│       ├── stripe.ts
│       ├── github.ts
│       ├── replicate.ts
│       ├── twilio.ts
│       └── generic.ts
├── storage/                  # Persistence layer
│   ├── database.ts           # SQLite connection (better-sqlite3)
│   ├── schema.ts             # Schema definition and migrations
│   ├── repositories/         # Data access objects
│   └── index.ts              # Storage service facade
├── middleware/               # Express middleware
│   ├── rateLimit.ts          # In-memory rate limiter
│   └── rawBody.ts            # Raw body capture for signature validation
├── services/
│   └── cleanup.ts            # Event retention cleanup service
└── utils/
    ├── crypto.ts             # AES-256-GCM encrypt/decrypt, SHA-256 key derivation
    ├── errors.ts             # Structured error hierarchy
    ├── logger.ts             # pino structured logger
    ├── patterns.ts           # Event type wildcard matching
    └── validation.ts         # Runtime input validation helpers
```

## Security

- **Signature validation**: All webhooks validated with `crypto.timingSafeEqual` for constant-time comparison
- **Secrets at rest**: Signing secrets encrypted with AES-256-GCM (key derived via SHA-256 from `ENCRYPTION_KEY`)
- **Rate limiting**: In-memory per-IP sliding window rate limiting on all webhook ingestion endpoints
- **Input validation**: All inputs validated with Zod schemas; SQL injection prevented via parameterized queries
- **Deduplication**: Webhook-level deduplication by `webhookId` prevents replay attacks
- **Admin auth**: `ADMIN_API_KEY` secures the `/admin/cleanup` endpoint in production

## Limitations

- **Single-instance polling**: `webhooks.poll` blocking mode uses in-memory waiters per process. In a horizontally-scaled deployment, a webhook arriving on one instance will not wake a poller on another. Use non-blocking polling (`timeout: 0`) for multi-instance deployments, or deploy as a single instance.
- **In-memory rate limiting**: Rate limits are not shared across instances behind a load balancer. For multi-instance deployments, use an external rate limiting solution (e.g. a reverse proxy).

## License

MIT — see [LICENSE](LICENSE) for details.
