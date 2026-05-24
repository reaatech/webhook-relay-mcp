# Changelog

## 0.2.0 (2026-05-23)

### Added

- **9 new MCP tools**: `webhooks.stats`, `webhooks.replay`, `webhooks.update-source`, `webhooks.delete-source`, `webhooks.rotate-secret`, `webhooks.list-sources`, `webhooks.audit-log`, `webhooks.source-health`, `webhooks.event-types`
- **3 new webhook sources**: SendGrid (email events), Slack (slash commands/events), Vercel (deployments)
- **Outbound delivery engine** with HMAC-SHA256 signing, exponential backoff retry, and dead-letter queue
- **Prometheus metrics** at `/metrics` endpoint: 7 counters/gauges for ingestion, validation, delivery, and polling
- **MCP client authentication**: Optional API key auth via `X-API-Key` or `Authorization: Bearer` headers
- **Advanced event filter DSL**: Support for `$eq`, `$neq`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$regex`, `$exists`, `$and`, `$or`, `$not` operators with dot-notation nested field access
- **Admin dashboard**: Self-contained HTML UI at `/` showing sources, events, subscriptions, and stats
- **Audit logging**: Persistent audit trail for all MCP tool operations
- **Source health monitoring**: Heartbeat tracking with configurable expected interval

### Changed

- Schema v3: Added delivery_status, retry_count, audit_log table, source health tracking, subscription metadata
- Source management now supports update, delete, and secret rotation via MCP tools
- Subscription filters upgraded to DSL with backward compatibility for simple key-value filters
- Docker Compose hardened with resource limits, restart policies, log rotation, and health checks

## 0.1.0 (2026-05-23)

### Added

- Initial release of webhook-relay-mcp
- Multi-source webhook ingestion: Stripe, GitHub, Replicate, Twilio, and Generic
- HMAC-SHA256/SHA1 signature validation with constant-time comparison
- Event normalization into unified schema
- Deduplication by webhook ID
- 6 MCP tools: `webhooks.subscribe`, `webhooks.unsubscribe`, `webhooks.list`, `webhooks.poll`, `webhooks.history`, `webhooks.register`
- Dual transport: stdio and HTTP/SSE
- SQLite storage with WAL mode and schema migrations
- In-memory rate limiting on webhook endpoints
- Configurable event retention with automatic cleanup
- AES-256-GCM encryption for webhook secrets at rest
- Docker multi-stage build with health checks and non-root user
- Monorepo structure with 5 publishable packages: core, storage, webhooks, mcp, server
