# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in webhook-relay-mcp, please report it responsibly.

**Please do not open public issues for security bugs.**

Instead, email security concerns to the maintainers at the repository contact information, or open a private security advisory via GitHub.

We aim to respond to security reports within 48 hours and will work with you to verify, prioritize, and fix the issue.

## Security Features

- **Webhook signature validation**: All incoming webhooks are validated using HMAC-SHA256/SHA1 (or provider-specific algorithms) with constant-time comparison via `crypto.timingSafeEqual` to prevent timing attacks.
- **Secret encryption**: Webhook signing secrets are encrypted at rest using AES-256-GCM (key derived via SHA-256 from `ENCRYPTION_KEY`).
- **MCP client authentication**: Optional API key authentication for HTTP/SSE transport via `X-API-Key` header or `Authorization: Bearer` token. Configured via `MCP_API_KEY` environment variable.
- **Audit logging**: All MCP tool operations are persisted to the `audit_log` table including actor, action, resource type, resource ID, and timestamp.
- **Advanced input validation**: MCP tool inputs validated with Zod schemas. Advanced filter DSL supports 13 operators ($eq, $gt, $in, $regex, $and, $or, $not, etc.) with proper parameterization.
- **Rate limiting**: In-memory per-IP sliding window rate limiting prevents abuse of webhook endpoints. Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`.
- **SQL injection prevention**: All database queries use parameterized statements via better-sqlite3.
- **Admin API authorization**: `ADMIN_API_KEY` secures the `/admin/cleanup` endpoint in production.
- **Deduplication**: Webhook-level deduplication by `webhookId` prevents replay attacks.
- **Source health monitoring**: Heartbeat tracking detects misconfigured or inactive webhook sources.
- **Dead-letter queue**: Failed outbound deliveries are tracked with retry attempts and error messages for debugging.
