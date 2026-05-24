# webhook-relay-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-^1.0.4-blue)](https://github.com/modelcontextprotocol/sdk)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that bridges third-party webhooks into agent workflows. Receives webhooks from Stripe, GitHub, Replicate, Twilio, SendGrid, Slack, Vercel, and generic sources, normalizes them into a consistent event format, and exposes them to MCP clients via subscription-based polling.

## Features

- **Multi-source ingestion** — Stripe, GitHub, Replicate, Twilio, SendGrid, Slack, Vercel, and Generic
- **Signature validation** — HMAC-SHA256/SHA1 verification with constant-time comparison
- **Advanced filtering** — DSL with 13 operators ($eq, $gt, $in, $regex, $and, $or, $not, etc.) and dot-notation
- **Event normalization** — Source-specific payloads normalized into a unified schema
- **Deduplication** — Ingress-level deduplication by webhookId
- **MCP tools** — 15 tools: subscribe, unsubscribe, list, poll, history, register, stats, replay, update-source, delete-source, rotate-secret, list-sources, audit-log, source-health, event-types
- **Dual transport** — stdio for local agents, HTTP/SSE for remote agents
- **Outbound delivery** — Forward events to external URLs with retry and dead-letter queue
- **Prometheus metrics** — 7 counters/gauges at /metrics endpoint
- **Admin dashboard** — Built-in web UI at /
- **MCP authentication** — Optional API key auth for HTTP/SSE connections
- **Audit logging** — Persistent audit trail of all operations
- **Source health monitoring** — Heartbeat tracking per webhook source
- **SQLite storage** — WAL mode, schema migrations, foreign keys
- **Rate limiting** — In-memory per-IP rate limiting
- **Event retention** — Configurable automatic cleanup
- **Docker support** — Multi-stage build with health checks

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
| `MCP_API_KEY` | *(optional)* | API key for MCP client authentication |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics endpoint |
| `DELIVERY_RETRY_MAX` | `5` | Max retry attempts for outbound delivery |
| `DELIVERY_RETRY_BACKOFF_MS` | `1000` | Base backoff time for retries (ms) |
| `SOURCE_HEARTBEAT_MINUTES` | `60` | Expected heartbeat interval for source health |
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
| `filters` | `object` | No | Filter DSL expression (supports operators: $eq, $gt, $in, $regex, $and, $or, $not, etc.) |
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
| `sourceType` | `string` | Yes | One of: `stripe`, `github`, `replicate`, `twilio`, `sendgrid`, `slack`, `vercel`, `generic` |
| `signingSecret` | `string` | Yes | Webhook signing secret (encrypted at rest) |
| `webhookUrl` | `string` | No | Custom endpoint URL (auto-generated from `WEBHOOK_BASE_URL` if omitted) |

### `webhooks.stats`

Get aggregate statistics for webhook events.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventTypes` | `string[]` | No | Filter by event types |
| `sources` | `string[]` | No | Filter by source |
| `startTime` | `string` | No | ISO 8601 start |
| `endTime` | `string` | No | ISO 8601 end |
| `groupBy` | `string` | No | Group by: `type`, `source`, `hour`, `day` |

### `webhooks.replay`

Replay webhook events to trigger downstream processing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventId` | `string` | No | Specific event ID to replay |
| `startTime` | `string` | No | ISO 8601 start range |
| `endTime` | `string` | No | ISO 8601 end range |
| `limit` | `number` | No | Max events (default 10, max 50) |

### `webhooks.update-source`

Update an existing webhook source configuration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Source name to update |
| `updates` | `object` | Yes | Fields: `newName`, `signingSecret`, `isActive`, `webhookUrl` |

### `webhooks.delete-source`

Delete a webhook source configuration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Source name to delete |

### `webhooks.rotate-secret`

Rotate a webhook signing secret.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Source name |
| `newSecret` | `string` | Yes | New signing secret (min 8 chars) |

### `webhooks.list-sources`

List registered webhook sources.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `activeOnly` | `boolean` | No | Only active sources (default: `false`) |
| `sourceType` | `string` | No | Filter by type |

### `webhooks.audit-log`

Query the persistent audit trail of all operations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `actor` | `string` | No | Filter by actor |
| `action` | `string` | No | Filter by action |
| `resourceType` | `string` | No | Filter by resource type |
| `startTime` | `string` | No | ISO 8601 start |
| `endTime` | `string` | No | ISO 8601 end |
| `limit` | `number` | No | Max results (default 50, max 100) |

### `webhooks.source-health`

Check heartbeat status for webhook sources.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | No | Specific source name (all if omitted) |

### `webhooks.event-types`

List available event types across registered sources.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | `string` | No | Filter by source |

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Admin dashboard web UI |
| `GET` | `/health` | Basic health check with version |
| `GET` | `/health/ready` | Readiness probe |
| `GET` | `/metrics` | Prometheus metrics endpoint |
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

### SendGrid

- Validates `X-SendGrid-Signature` header (HMAC-SHA256), batch event payloads
- 11 email event type mappings

### Slack

- Custom v0 signature format (HMAC-SHA256 of `v0:timestamp:body`)
- Events API payload structure, interactive message support

### Vercel

- Validates `x-vercel-signature` header (HMAC-SHA1)
- 9 deployment/project/domain event type mappings

### Generic

- Configurable HMAC algorithm via `x-signature-algorithm` header
- Pass-through normalization (preserves original payload structure)

## Architecture

```
                   ┌──────────────────────────────────────────────────────────────┐
                   │                     webhook-relay-mcp                          │
                   │                                                               │
External Services  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────────────┐ │  ┌───────────┐
┌───────────────┐  │  │ Express  │  │ Signature │  │ SQLite   │  │   Outbound  │ │  │    MCP    │
│ Stripe        │──┼─▶│ HTTP     │─▶│ Validator │─▶│ (WAL)    │─▶│   Delivery  │─┼─▶│  Clients  │
│ GitHub        │──┼─▶│ Server   │  │           │  │          │  │   Engine    │ │  │ (Agents)  │
│ Replicate     │──┼─▶│          │  │ Normalize │  │ Events   │  │  + Retry    │ │  │           │
│ Twilio        │──┼─▶│ /webhooks│  └───────────┘  │ Subscrip │  │  + DLQ      │ │  │ stdio or  │
│ SendGrid      │──┼─▶│ /:name   │                 │ tions    │  └─────────────┘ │  │ HTTP/SSE  │
│ Slack         │──┼─▶│          │  ┌───────────┐  │ Audit    │                  │  │           │
│ Vercel        │──┼─▶│          │  │ Advanced  │  │ Log      │  ┌───────────┐  │  │ 15 tools  │
│ Generic       │──┼─▶│          │  │ Filter    │  │ Sources  │  │ Prometheus│  │  │           │
└───────────────┘  │  └──────────┘  │ DSL ($gt, │  │ Health   │  │ /metrics  │  │  └───────────┘
                   │               │ $in, ...)  │  │          │  └───────────┘  │
                   │               └───────────┘  │          │                 │
                   │                              └──────────┘                 │
                   │                                    │                      │
                   │                    ┌───────────────┘                      │
                   │                    ▼                                      │
                   │              ┌───────────┐  ┌───────────┐               │
                   │              │   Admin   │  │    MCP    │               │
                   │              │ Dashboard │  │   Auth    │               │
                   │              │    (/)    │  │ (API Key) │               │
                   │              └───────────┘  └───────────┘               │
                   └──────────────────────────────────────────────────────────────┘
```

**Data flow**: External webhook → signature validation → payload normalization → deduplication check → SQLite storage → notify matching poll waiters → MCP clients receive events. Outbound delivery forwards events to external URLs with retry and dead-letter queue.

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
packages/
├── core/                      # Shared types, config, crypto, validation, filters, metrics
├── storage/                   # SQLite, repositories, migrations, services
│   ├── repositories/          # Events, Subscriptions, Sources, Audit
│   └── services/              # Cleanup, Delivery, Audit, SourceHealth, PollWaiter
├── webhooks/                  # Ingest, validators, source handlers
│   ├── sources/               # stripe, github, replicate, twilio, sendgrid, slack, vercel, generic
│   └── validators/            # HMAC, Stripe, GitHub, Slack, Twilio
├── mcp/                       # MCP server, tool implementations (15 tools)
│   └── tools/
└── server/                    # Express HTTP server, middleware, dashboard
    └── middleware/             # RateLimit, RawBody, MCPAuth
```

## Security

- **Signature validation**: All webhooks validated with `crypto.timingSafeEqual` for constant-time comparison
- **Secrets at rest**: Signing secrets encrypted with AES-256-GCM
- **MCP authentication**: Optional API key auth for HTTP/SSE connections via `X-API-Key` or `Authorization: Bearer`
- **Audit logging**: Persistent audit trail of all MCP tool operations in the audit_log table
- **Rate limiting**: In-memory per-IP sliding window rate limiting on all webhook ingestion endpoints
- **Input validation**: All inputs validated with Zod schemas; SQL injection prevented via parameterized queries
- **Deduplication**: Webhook-level deduplication by `webhookId` prevents replay attacks
- **Admin auth**: `ADMIN_API_KEY` secures the `/admin/cleanup` endpoint in production

## Limitations

- **Single-instance polling**: `webhooks.poll` blocking mode uses in-memory waiters per process. In a horizontally-scaled deployment, a webhook arriving on one instance will not wake a poller on another instance. Use non-blocking polling (`timeout: 0`) for multi-instance deployments, or deploy as a single instance.
- **In-memory rate limiting**: Rate limits are not shared across instances behind a load balancer. For multi-instance deployments, use an external rate limiting solution.
- **SQLite scalability**: SQLite with WAL mode supports moderate concurrency but is not designed for high-throughput distributed workloads. Consider migrating to PostgreSQL for large-scale production deployments.

## License

MIT — see [LICENSE](LICENSE) for details.
