# Changelog

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
