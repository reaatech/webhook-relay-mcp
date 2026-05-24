# @reaatech/webhook-relay-webhooks

Webhook ingestion, signature validators, and source handlers for
[webhook-relay-mcp](https://github.com/reaatech/webhook-relay-mcp).

This is an internal building block of the webhook-relay-mcp project. Most users want
the runnable server instead — see
[`@reaatech/webhook-relay-mcp`](https://www.npmjs.com/package/@reaatech/webhook-relay-mcp).

## Install

```bash
npm install @reaatech/webhook-relay-webhooks
```

## What's inside

- Source handlers: Stripe, GitHub, Replicate, Twilio, SendGrid, Slack, Vercel, Generic
- Signature validators: HMAC-SHA256/SHA1 with constant-time comparison
- Payload normalization into a unified event schema
- Ingress-level deduplication by `webhookId`

## License

MIT — see [LICENSE](./LICENSE).
