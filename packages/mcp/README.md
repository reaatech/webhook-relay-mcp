# @reaatech/webhook-relay-tools

The MCP (Model Context Protocol) server implementation and tool definitions for
[webhook-relay-mcp](https://github.com/reaatech/webhook-relay-mcp).

This package is a **library** that exposes the MCP server and its 15 tools. To run a
ready-to-go server (HTTP ingestion + MCP transport + dashboard), install the bundled
entry point instead:
[`@reaatech/webhook-relay-mcp`](https://www.npmjs.com/package/@reaatech/webhook-relay-mcp).

## Install

```bash
npm install @reaatech/webhook-relay-tools
```

## What's inside

- `startMCPServer(...)` — wires the MCP server over stdio or HTTP/SSE
- 15 webhook tools: subscribe, unsubscribe, list, poll, history, register, stats,
  replay, update-source, delete-source, rotate-secret, list-sources, audit-log,
  source-health, event-types

Built on [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).

## License

MIT — see [LICENSE](./LICENSE).
