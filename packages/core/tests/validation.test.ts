import {
  auditLogSchema,
  deleteSourceSchema,
  eventTypesSchema,
  historySchema,
  listSourcesSchema,
  pollSchema,
  registerSourceSchema,
  replaySchema,
  rotateSecretSchema,
  sourceHealthSchema,
  statsSchema,
  subscribeSchema,
  updateSourceSchema,
} from '@reaatech/webhook-relay-core';
import { describe, expect, it } from 'vitest';

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

    it('should accept nested filter values covering recursive schema', () => {
      const result = subscribeSchema.safeParse({
        eventTypes: ['payment.*'],
        filters: {
          source: 'stripe',
          metadata: { nested: { key: 'value' } },
          tags: ['important', 'high-priority'],
        },
      });
      expect(result.success).toBe(true);
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

  describe('updateSourceSchema', () => {
    it('should validate valid update', () => {
      const result = updateSourceSchema.safeParse({
        name: 'my-source',
        updates: { newName: 'renamed-source' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty updates object', () => {
      const result = updateSourceSchema.safeParse({
        name: 'my-source',
        updates: {},
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid newName', () => {
      const result = updateSourceSchema.safeParse({
        name: 'my-source',
        updates: { newName: 'x'.repeat(101) },
      });
      expect(result.success).toBe(false);
    });

    it('should reject short signingSecret in updates', () => {
      const result = updateSourceSchema.safeParse({
        name: 'my-source',
        updates: { signingSecret: 'short' },
      });
      expect(result.success).toBe(false);
    });

    it('should accept isActive update', () => {
      const result = updateSourceSchema.safeParse({
        name: 'my-source',
        updates: { isActive: false },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('statsSchema', () => {
    it('should validate valid stats query', () => {
      const result = statsSchema.safeParse({
        eventTypes: ['payment.*'],
        groupBy: 'type',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid groupBy', () => {
      const result = statsSchema.safeParse({ groupBy: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('replaySchema', () => {
    it('should validate valid replay request', () => {
      const result = replaySchema.safeParse({ eventId: 'evt-1' });
      expect(result.success).toBe(true);
    });

    it('should default limit to 10', () => {
      const result = replaySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should reject limit over 50', () => {
      const result = replaySchema.safeParse({ limit: 100 });
      expect(result.success).toBe(false);
    });
  });

  describe('deleteSourceSchema', () => {
    it('should validate valid delete', () => {
      const result = deleteSourceSchema.safeParse({ name: 'my-source' });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = deleteSourceSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('rotateSecretSchema', () => {
    it('should validate valid rotation', () => {
      const result = rotateSecretSchema.safeParse({
        name: 'my-source',
        newSecret: 'new-secret-12345',
      });
      expect(result.success).toBe(true);
    });

    it('should reject short newSecret', () => {
      const result = rotateSecretSchema.safeParse({ name: 'my-source', newSecret: 'short' });
      expect(result.success).toBe(false);
    });
  });

  describe('listSourcesSchema', () => {
    it('should validate with defaults', () => {
      const result = listSourcesSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activeOnly).toBe(false);
      }
    });

    it('should accept sourceType filter', () => {
      const result = listSourcesSchema.safeParse({ sourceType: 'stripe', activeOnly: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activeOnly).toBe(true);
        expect(result.data.sourceType).toBe('stripe');
      }
    });
  });

  describe('auditLogSchema', () => {
    it('should validate valid audit query', () => {
      const result = auditLogSchema.safeParse({
        actor: 'admin',
        action: 'source.create',
        limit: 25,
      });
      expect(result.success).toBe(true);
    });

    it('should default limit to 50', () => {
      const result = auditLogSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('should reject limit over 100', () => {
      const result = auditLogSchema.safeParse({ limit: 200 });
      expect(result.success).toBe(false);
    });
  });

  describe('sourceHealthSchema', () => {
    it('should validate empty request', () => {
      const result = sourceHealthSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept name filter', () => {
      const result = sourceHealthSchema.safeParse({ name: 'my-source' });
      expect(result.success).toBe(true);
    });
  });

  describe('eventTypesSchema', () => {
    it('should validate empty request', () => {
      const result = eventTypesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept source filter', () => {
      const result = eventTypesSchema.safeParse({ source: 'stripe' });
      expect(result.success).toBe(true);
    });
  });
});
