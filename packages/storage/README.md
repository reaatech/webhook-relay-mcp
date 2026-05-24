# @reaatech/webhook-relay-storage

SQLite storage, repositories, migrations, and services for
[webhook-relay-mcp](https://github.com/reaatech/webhook-relay-mcp).

This is an internal building block of the webhook-relay-mcp project. Most users want
the runnable server instead — see
[`@reaatech/webhook-relay-mcp`](https://www.npmjs.com/package/@reaatech/webhook-relay-mcp).

## Install

```bash
npm install @reaatech/webhook-relay-storage
```

> **Native dependency:** uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3),
> a native addon. Installation downloads a prebuilt binary when one exists for your
> platform/Node version, otherwise it compiles from source (requires a C++ toolchain —
> e.g. `build-essential` + `python3` on Linux, Xcode CLT on macOS).

## What's inside

- `better-sqlite3` connection with WAL mode and foreign keys
- Schema migrations
- Repositories: Events, Subscriptions, Sources, Audit
- Services: Cleanup, Delivery (retry + DLQ), Audit, SourceHealth, PollWaiter

## License

MIT — see [LICENSE](./LICENSE).
