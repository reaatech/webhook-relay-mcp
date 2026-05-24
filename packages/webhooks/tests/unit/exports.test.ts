import { describe, expect, it } from 'vitest';

describe('package exports', () => {
  it('should export webhookRouter', async () => {
    const mod = await import('@reaatech/webhook-relay-webhooks');
    expect(mod.webhookRouter).toBeDefined();
  });

  it('should export getWebhookSource', async () => {
    const mod = await import('@reaatech/webhook-relay-webhooks');
    expect(typeof mod.getWebhookSource).toBe('function');
  });

  it('should export registerWebhookSource', async () => {
    const mod = await import('@reaatech/webhook-relay-webhooks');
    expect(typeof mod.registerWebhookSource).toBe('function');
  });

  it('should export all webhook source classes', async () => {
    const mod = await import('@reaatech/webhook-relay-webhooks');
    expect(mod.StripeWebhookSource).toBeDefined();
    expect(mod.GitHubWebhookSource).toBeDefined();
    expect(mod.ReplicateWebhookSource).toBeDefined();
    expect(mod.SendGridWebhookSource).toBeDefined();
    expect(mod.SlackWebhookSource).toBeDefined();
    expect(mod.TwilioWebhookSource).toBeDefined();
    expect(mod.VercelWebhookSource).toBeDefined();
    expect(mod.GenericWebhookSource).toBeDefined();
  });

  it('should export validator classes', async () => {
    const mod = await import('@reaatech/webhook-relay-webhooks');
    expect(mod.HMACSignatureValidator).toBeDefined();
    expect(mod.StripeSignatureValidator).toBeDefined();
    expect(mod.GitHubSignatureValidator).toBeDefined();
    expect(mod.SlackSignatureValidator).toBeDefined();
  });

  it('should export rateLimit', async () => {
    const mod = await import('@reaatech/webhook-relay-webhooks');
    expect(typeof mod.rateLimit).toBe('function');
  });

  it('should export type interfaces as types-only', async () => {
    // Types are stripped at runtime, so they should be undefined
    const mod = await import('@reaatech/webhook-relay-webhooks');
    const allExports = mod as Record<string, unknown>;
    expect(allExports.WebhookRequest).toBeUndefined();
    expect(allExports.WebhookSource).toBeUndefined();
    expect(allExports.NormalizedWebhookEvent).toBeUndefined();
    expect(allExports.WebhookConfig).toBeUndefined();
  });
});
