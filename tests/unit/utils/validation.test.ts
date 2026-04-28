import { describe, it, expect } from 'vitest';
import {
  subscribeSchema,
  pollSchema,
  historySchema,
  registerSourceSchema,
} from '../../../src/utils/validation.js';

describe('validation schemas', () => {
  describe('subscribeSchema', () => {
    it('should validate valid subscription', () => {
      const result = subscribeSchema.safeParse({
        eventTypes: ['payment.*'],
        filters: { source: 'stripe' },
        ttl: 3600,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty eventTypes', () => {
      const result = subscribeSchema.safeParse({ eventTypes: [] });
      expect(result.success).toBe(false);
    });

    it('should allow large TTL (capped in tool logic)', () => {
      const result = subscribeSchema.safeParse({ eventTypes: ['test'], ttl: 100000 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ttl).toBe(100000);
      }
    });

    it('should default TTL to 3600', () => {
      const result = subscribeSchema.safeParse({ eventTypes: ['test'] });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ttl).toBe(3600);
      }
    });
  });

  describe('pollSchema', () => {
    it('should validate valid poll', () => {
      const result = pollSchema.safeParse({
        subscriptionId: 'sub-1',
        eventTypes: ['payment.*'],
        timeout: 30,
        limit: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject timeout too high', () => {
      const result = pollSchema.safeParse({ subscriptionId: 'sub-1', timeout: 200 });
      expect(result.success).toBe(false);
    });

    it('should reject limit too high', () => {
      const result = pollSchema.safeParse({ subscriptionId: 'sub-1', limit: 200 });
      expect(result.success).toBe(false);
    });
  });

  describe('historySchema', () => {
    it('should validate valid history query', () => {
      const result = historySchema.safeParse({
        eventTypes: ['payment.*'],
        sources: ['stripe'],
        limit: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid datetime', () => {
      const result = historySchema.safeParse({ startTime: 'not-a-date' });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSourceSchema', () => {
    it('should validate valid source', () => {
      const result = registerSourceSchema.safeParse({
        name: 'my-source',
        sourceType: 'stripe',
        signingSecret: 'long-enough-secret',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid name format', () => {
      const result = registerSourceSchema.safeParse({
        name: 'My Source!',
        sourceType: 'stripe',
        signingSecret: 'secret',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short signingSecret', () => {
      const result = registerSourceSchema.safeParse({
        name: 'my-source',
        sourceType: 'stripe',
        signingSecret: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid sourceType', () => {
      const result = registerSourceSchema.safeParse({
        name: 'my-source',
        sourceType: 'invalid',
        signingSecret: 'long-enough-secret',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid webhookUrl', () => {
      const result = registerSourceSchema.safeParse({
        name: 'my-source',
        sourceType: 'stripe',
        signingSecret: 'long-enough-secret',
        webhookUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });
});
