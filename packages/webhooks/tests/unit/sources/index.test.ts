import type { WebhookSource } from '@reaatech/webhook-relay-webhooks';
import {
  GenericWebhookSource,
  GitHubWebhookSource,
  getWebhookSource,
  ReplicateWebhookSource,
  registerWebhookSource,
  StripeWebhookSource,
} from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';

describe('getWebhookSource', () => {
  it('should return a StripeWebhookSource for stripe', () => {
    const source = getWebhookSource('stripe');
    expect(source).toBeInstanceOf(StripeWebhookSource);
  });

  it('should return a GitHubWebhookSource for github', () => {
    const source = getWebhookSource('github');
    expect(source).toBeInstanceOf(GitHubWebhookSource);
  });

  it('should return a ReplicateWebhookSource for replicate', () => {
    const source = getWebhookSource('replicate');
    expect(source).toBeInstanceOf(ReplicateWebhookSource);
  });

  it('should return a GenericWebhookSource for generic', () => {
    const source = getWebhookSource('generic');
    expect(source).toBeInstanceOf(GenericWebhookSource);
  });

  it('should return a new instance each call', () => {
    const a = getWebhookSource('stripe');
    const b = getWebhookSource('stripe');
    expect(a).not.toBe(b);
  });

  it('should return undefined for unknown source type', () => {
    const source = getWebhookSource('nonexistent');
    expect(source).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const source = getWebhookSource('');
    expect(source).toBeUndefined();
  });
});

describe('registerWebhookSource', () => {
  class MockSource implements WebhookSource {
    readonly name = 'mock';
    readonly displayName = 'Mock';
    async validateSignature() {
      return true;
    }
    async normalizePayload() {
      return {
        id: 'test',
        type: 'test',
        source: 'mock',
        sourceType: 'test',
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        data: {},
        rawPayload: {},
        metadata: {},
      };
    }
    getEventType() {
      return 'test';
    }
    getWebhookId() {
      return undefined;
    }
  }

  it('should register a new source type', () => {
    registerWebhookSource('custom', MockSource);
    const source = getWebhookSource('custom');
    expect(source).toBeInstanceOf(MockSource);
  });

  it('should allow overriding an existing source', () => {
    registerWebhookSource('stripe', MockSource);
    const source = getWebhookSource('stripe');
    expect(source).toBeInstanceOf(MockSource);
  });

  it('should make registered source available immediately', () => {
    registerWebhookSource('instant', MockSource);
    const source = getWebhookSource('instant');
    expect(source?.name).toBe('mock');
  });
});
