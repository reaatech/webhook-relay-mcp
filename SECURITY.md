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

- **Webhook signature validation**: All incoming webhooks are validated using HMAC-SHA256 (or provider-specific algorithms) with constant-time comparison to prevent timing attacks.
- **Secret encryption**: Webhook signing secrets are encrypted at rest using AES-256-GCM.
- **Rate limiting**: In-memory per-IP rate limiting prevents abuse of webhook endpoints.
- **Input validation**: All MCP tool inputs are validated, and SQL queries use parameterized statements.
