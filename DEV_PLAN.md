# Development Plan: webhook-relay-mcp

## Project Overview

**webhook-relay-mcp** is an MCP server that receives webhooks from external services and translates them into agent-consumable events. This solves the critical problem of async operation handling in AI agent systems — currently, agents either poll for results or ignore async operations entirely.

### Problem Statement

Half the tools agents interact with are async:
- **Replicate** predictions (video/image generation takes minutes)
- **Stripe** payment events (webhook-driven by nature)
- **GitHub Actions** CI/CD notifications
- **Calendar** updates and reminders
- **Deployment** notifications from Vercel, Netlify, etc.

Every agent system either polls inefficiently or ignores async results. This infrastructure handles it elegantly.

### Solution

1. Register webhook endpoints per source
2. Validate signatures (Stripe, GitHub, Twilio, etc.)
3. Normalize payloads into a standard event schema
4. Store events persistently
5. Expose MCP tools for agent interaction

### MCP Tools

| Tool | Description |
|------|-------------|
| `webhooks.subscribe` | Subscribe to specific event types with filtering |
| `webhooks.poll` | Poll for events matching criteria (with timeout support) |
| `webhooks.history` | Query historical events with pagination |
| `webhooks.register` | Register a new webhook source/endpoint |
| `webhooks.unsubscribe` | Remove an event subscription |

---

## Development Phases

### Phase 1: Foundation & Core Infrastructure (Week 1)

#### 1.1 Project Setup
- [ ] Initialize pnpm workspace with TypeScript
- [ ] Configure ESLint, Prettier, and EditorConfig
- [ ] Set up Vitest for unit testing
- [ ] Configure Husky pre-commit hooks
- [ ] Set up GitHub Actions CI pipeline
- [ ] Create package.json with all dependencies

#### 1.2 Core Architecture
- [ ] Implement MCP server skeleton using `@modelcontextprotocol/sdk` (stdio + SSE transports)
- [ ] Design event schema and TypeScript interfaces
- [ ] Create base webhook handler abstraction
- [ ] Implement HTTP server with Express
- [ ] Add raw body middleware for signature validation

#### 1.3 Storage Layer
- [ ] Design SQLite schema for events and subscriptions
- [ ] Implement repository pattern with better-sqlite3
- [ ] Create migration system
- [ ] Add connection pooling and error handling

#### Deliverables
- Working project structure
- Basic MCP server responding to health checks
- SQLite database with schema
- CI pipeline passing

---

### Phase 2: Webhook Ingestion & Validation (Week 2)

#### 2.1 Signature Verification
- [ ] Stripe signature verification (HMAC-SHA256)
- [ ] GitHub webhook signature verification
- [ ] Twilio signature validation
- [ ] Generic HMAC signature validator
- [ ] Signature verification middleware

#### 2.2 Webhook Sources
- [ ] Stripe webhook handler and normalizer
- [ ] GitHub webhook handler and normalizer
- [ ] Replicate webhook handler and normalizer
- [ ] Twilio webhook handler and normalizer
- [ ] Generic webhook handler for unknown sources

#### 2.3 Payload Normalization
- [ ] Design normalized event schema
- [ ] Implement transformers for each source
- [ ] Add event type mapping and categorization
- [ ] Handle payload versioning

#### Deliverables
- Signature verification working for major platforms
- Webhook ingestion endpoint operational
- Normalized events stored in database
- Unit tests for all validators

---

### Phase 3: MCP Tools Implementation (Week 3)

#### 3.1 Subscription Management
- [ ] Implement `webhooks.subscribe` tool
- [ ] Create subscription storage and filtering
- [ ] Add subscription expiration/TTL
- [ ] Implement `webhooks.unsubscribe` tool
- [ ] List active subscriptions tool

#### 3.2 Event Polling
- [ ] Implement `webhooks.poll` tool with blocking behavior
- [ ] Add timeout and long-polling support
- [ ] Implement event filtering by type, source, metadata
- [ ] Add batch retrieval support

#### 3.3 History & Querying
- [ ] Implement `webhooks.history` tool
- [ ] Add pagination and cursor-based navigation
- [ ] Implement date range filtering
- [ ] Add search by event ID and correlation ID

#### Deliverables
- All MCP tools functional
- Integration tests for tool interactions
- Documentation for each tool

---

### Phase 4: Advanced Features (Week 4)

#### 4.1 Event Routing & Filtering
- [ ] Implement event routing rules engine
- [ ] Add regex pattern matching for event types
- [ ] Create subscription filters (by source, type, payload content)
- [ ] Add event deduplication

#### 4.2 Retry & Reliability
- [ ] Implement dead-letter queue for failed events
- [ ] Add event replay capability
- [ ] Create webhook endpoint health monitoring
- [ ] Implement circuit breaker for external webhooks

#### 4.3 Security & Rate Limiting
- [ ] Add API key authentication for MCP tools
- [ ] Implement rate limiting per subscription
- [ ] Add IP allowlisting for webhook sources
- [ ] Implement audit logging

#### Deliverables
- Production-ready reliability features
- Security hardening complete
- Performance benchmarks

---

### Phase 5: Polish & Production Readiness (Week 5)

#### 5.1 Observability
- [ ] Add structured logging with pino
- [ ] Implement metrics collection (Prometheus format)
- [ ] Add health check endpoints
- [ ] Create request tracing with correlation IDs

#### 5.2 Configuration & Deployment
- [ ] Externalize configuration with dotenv and validation
- [ ] Create Dockerfile and docker-compose.yml
- [ ] Document deployment procedures

#### 5.3 Documentation
- [ ] Write comprehensive README.md
- [ ] Create API documentation
- [ ] Add example configurations
- [ ] Document webhook source setup guides

#### Deliverables
- Complete documentation
- Docker images built and tested
- Production deployment guide

---

## Dependencies

### Core Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^1.x",
  "express": "^4.x",
  "better-sqlite3": "^9.x",
  "zod": "^3.x",
  "pino": "^8.x",
  "uuid": "^9.x",
  "ulid": "^2.x",
  "raw-body": "^2.x"
}
```

### Dev Dependencies
```json
{
  "typescript": "^5.x",
  "vitest": "^1.x",
  "@vitest/coverage-v8": "^1.x",
  "eslint": "^8.x",
  "@typescript-eslint/eslint-plugin": "^7.x",
  "@typescript-eslint/parser": "^7.x",
  "prettier": "^3.x",
  "@types/better-sqlite3": "^7.x",
  "@types/express": "^4.x",
  "@types/node": "^20.x",
  "@types/ulid": "^2.x",
  "husky": "^9.x",
  "lint-staged": "^15.x",
  "tsx": "^4.x"
}
```

---

## Project Structure

```
webhook-relay-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # HTTP server setup
│   ├── config.ts             # Configuration management
│   ├── types/                # TypeScript type definitions
│   │   ├── events.ts         # Event schema types
│   │   ├── webhooks.ts       # Webhook source types
│   │   └── subscriptions.ts  # Subscription types
│   ├── handlers/             # MCP tool handlers
│   │   ├── subscribe.ts
│   │   ├── poll.ts
│   │   ├── history.ts
│   │   ├── register.ts
│   │   └── unsubscribe.ts
│   ├── webhooks/             # Webhook processing
│   │   ├── ingest.ts         # HTTP endpoint handler
│   │   ├── validator.ts      # Signature validation
│   │   ├── normalizer.ts     # Payload normalization
│   │   └── sources/          # Source-specific handlers
│   │       ├── stripe.ts
│   │       ├── github.ts
│   │       ├── replicate.ts
│   │       └── twilio.ts
│   ├── storage/              # Data persistence
│   │   ├── database.ts       # SQLite connection
│   │   ├── migrations/       # Database migrations
│   │   ├── repositories/     # Data access layer
│   │   │   ├── events.ts
│   │   │   └── subscriptions.ts
│   │   └── models/           # Data models
│   ├── middleware/           # Express middleware
│   │   ├── auth.ts
│   │   ├── rateLimit.ts
│   │   └── logging.ts
│   └── utils/                # Utilities
│       ├── logger.ts
│       ├── errors.ts
│       └── validation.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── api.md
│   ├── sources/
│   └── deployment.md
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Testing Strategy

### Unit Tests
- Signature verification algorithms
- Payload normalization transformers
- Repository CRUD operations
- Configuration validation

### Integration Tests
- End-to-end webhook ingestion flow
- MCP tool interactions
- Database transactions
- Subscription and event matching

### E2E Tests
- Full webhook lifecycle (register → receive → subscribe → poll)
- Multi-source webhook handling
- Error recovery scenarios

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Webhook processing latency (p95) | < 100ms |
| Event delivery reliability | > 99.9% |
| Signature verification accuracy | 100% |
| Test coverage | > 85% |
| Time to add new webhook source | < 2 hours |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Signature verification failures | Comprehensive test suite with real webhook samples |
| Database corruption | WAL mode, regular backups, migration testing |
| Memory leaks from long-polling | Timeout enforcement, connection limits |
| Rate limit abuse | Multi-tier rate limiting, IP-based controls |
| Schema evolution | Versioned event schemas, backward compatibility |

---

## Timeline Summary

| Week | Phase | Key Deliverables |
|------|-------|------------------|
| 1 | Foundation | Project setup, core architecture, storage layer |
| 2 | Webhook Ingestion | Signature verification, source handlers, normalization |
| 3 | MCP Tools | All 5 MCP tools implemented and tested |
| 4 | Advanced Features | Routing, retry logic, security hardening |
| 5 | Production | Observability, deployment, documentation |

---

## Related Projects

- **media-pipeline-mcp** (github.com/reaatech/media-pipeline-mcp): Complementary MCP server for media processing pipelines. webhook-relay-mcp handles the async notification aspect for services like Replicate used in media-pipeline-mcp.
