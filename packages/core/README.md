# @reaatech/webhook-relay-core

Shared types, configuration, crypto, validation, filter DSL, and metrics for
[webhook-relay-mcp](https://github.com/reaatech/webhook-relay-mcp).

This is an internal building block of the webhook-relay-mcp project. Most users want
the runnable server instead — see
[`@reaatech/webhook-relay-server`](https://www.npmjs.com/package/@reaatech/webhook-relay-server).

## Install

```bash
npm install @reaatech/webhook-relay-core
```

## What's inside

- Zod-validated environment/config loading
- Shared event and source type definitions
- AES-256-GCM secret encryption helpers
- Filter DSL evaluation (`$eq`, `$gt`, `$in`, `$regex`, `$and`, `$or`, `$not`, …)
- Prometheus metric registry
- A shared `pino` logger

## License

MIT — see [LICENSE](./LICENSE).
