# @reaatech/webhook-relay-mcp

The runnable entry point for [webhook-relay-mcp](https://github.com/reaatech/webhook-relay-mcp) —
an MCP server that bridges third-party webhooks (Stripe, GitHub, Replicate, Twilio,
SendGrid, Slack, Vercel, and generic sources) into agent workflows.

**This is the package most people want.** It bundles the HTTP ingestion server, the MCP
transport (stdio or HTTP/SSE), and the admin dashboard, and ships a `webhook-relay-mcp`
binary.

## Quick start

```bash
# Run directly with npx (no install)
ENCRYPTION_KEY=$(openssl rand -hex 32) npx @reaatech/webhook-relay-mcp

# Or install globally
npm install -g @reaatech/webhook-relay-mcp
ENCRYPTION_KEY=$(openssl rand -hex 32) webhook-relay-mcp
```

By default it starts in MCP **stdio** mode for local agents. For remote/multi-client
use, set `MCP_TRANSPORT=sse`.

> **Native dependency:** transitively depends on
> [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), a native addon. Install
> pulls a prebuilt binary when available, otherwise compiles from source (needs a C++
> toolchain).

## Configuration

`ENCRYPTION_KEY` is required (master key for encrypting webhook secrets at rest). See the
[main README](https://github.com/reaatech/webhook-relay-mcp#configuration) for the full
list of environment variables and the MCP tool/endpoint reference.

## License

MIT — see [LICENSE](./LICENSE).
