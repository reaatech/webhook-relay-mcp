import { evaluateFilter } from '@reaatech/webhook-relay-core';
import { describe, expect, it } from 'vitest';

const baseEvent = {
  type: 'payment.completed',
  source: 'stripe',
  sourceType: 'stripe',
  data: { amount: 5000, currency: 'usd' },
  deliveryStatus: 'delivered',
  retryCount: 2,
};

describe('evaluateFilter', () => {
  it('should return true for empty filter', () => {
    expect(evaluateFilter({}, baseEvent)).toBe(true);
  });

  it('should return true for null filter', () => {
    expect(evaluateFilter(null as unknown as Record<string, unknown>, baseEvent)).toBe(true);
  });

  describe('$eq operator', () => {
    it('should match equal values', () => {
      expect(evaluateFilter({ $eq: { type: 'payment.completed' } }, baseEvent)).toBe(true);
    });

    it('should not match different values', () => {
      expect(evaluateFilter({ $eq: { type: 'payment.failed' } }, baseEvent)).toBe(false);
    });
  });

  describe('$neq operator', () => {
    it('should match different values', () => {
      expect(evaluateFilter({ $neq: { type: 'payment.failed' } }, baseEvent)).toBe(true);
    });

    it('should not match equal values', () => {
      expect(evaluateFilter({ $neq: { type: 'payment.completed' } }, baseEvent)).toBe(false);
    });
  });

  describe('$gt operator', () => {
    it('should match when event value is greater', () => {
      expect(evaluateFilter({ $gt: { 'data.amount': 4000 } }, baseEvent)).toBe(true);
    });

    it('should not match when event value is less', () => {
      expect(evaluateFilter({ $gt: { 'data.amount': 6000 } }, baseEvent)).toBe(false);
    });

    it('should return false for non-numeric values', () => {
      expect(evaluateFilter({ $gt: { type: 'payment' } }, baseEvent)).toBe(false);
    });

    it('should coerce string filter value to number for comparison', () => {
      expect(evaluateFilter({ $gt: { 'data.amount': '4000' } }, baseEvent)).toBe(true);
    });

    it('should coerce number filter value when event value is parseable string', () => {
      const event = { ...baseEvent, retryCount: '5' };
      expect(evaluateFilter({ $eq: { retryCount: 5 } }, event)).toBe(true);
    });

    it('should handle numeric event with non-numeric string filter', () => {
      expect(evaluateFilter({ $eq: { 'data.amount': 'not-a-number' } }, baseEvent)).toBe(false);
    });

    it('should return false when event field is missing', () => {
      expect(evaluateFilter({ $gt: { nonexistent: 100 } }, baseEvent)).toBe(false);
    });
  });

  describe('$gte operator', () => {
    it('should match when event value is greater', () => {
      expect(evaluateFilter({ $gte: { 'data.amount': 4000 } }, baseEvent)).toBe(true);
    });

    it('should match when event value is equal', () => {
      expect(evaluateFilter({ $gte: { 'data.amount': 5000 } }, baseEvent)).toBe(true);
    });

    it('should not match when event value is less', () => {
      expect(evaluateFilter({ $gte: { 'data.amount': 6000 } }, baseEvent)).toBe(false);
    });

    it('should return false for non-numeric values', () => {
      expect(evaluateFilter({ $gte: { type: 'payment' } }, baseEvent)).toBe(false);
    });
  });

  describe('$lt operator', () => {
    it('should match when event value is less', () => {
      expect(evaluateFilter({ $lt: { 'data.amount': 6000 } }, baseEvent)).toBe(true);
    });

    it('should not match when event value is greater', () => {
      expect(evaluateFilter({ $lt: { 'data.amount': 4000 } }, baseEvent)).toBe(false);
    });

    it('should return false for non-numeric values', () => {
      expect(evaluateFilter({ $lt: { type: 'payment' } }, baseEvent)).toBe(false);
    });
  });

  describe('$lte operator', () => {
    it('should match when event value is less', () => {
      expect(evaluateFilter({ $lte: { 'data.amount': 6000 } }, baseEvent)).toBe(true);
    });

    it('should match when event value is equal', () => {
      expect(evaluateFilter({ $lte: { 'data.amount': 5000 } }, baseEvent)).toBe(true);
    });

    it('should not match when event value is greater', () => {
      expect(evaluateFilter({ $lte: { 'data.amount': 4000 } }, baseEvent)).toBe(false);
    });

    it('should return false for non-numeric values', () => {
      expect(evaluateFilter({ $lte: { type: 'payment' } }, baseEvent)).toBe(false);
    });
  });

  describe('$in operator', () => {
    it('should match value in array', () => {
      expect(
        evaluateFilter({ $in: { type: ['payment.completed', 'payment.failed'] } }, baseEvent),
      ).toBe(true);
    });

    it('should not match value not in array', () => {
      expect(
        evaluateFilter({ $in: { type: ['invoice.created', 'invoice.paid'] } }, baseEvent),
      ).toBe(false);
    });

    it('should return false when filter value is not an array', () => {
      expect(evaluateFilter({ $in: { type: 'not-an-array' } }, baseEvent)).toBe(false);
    });

    it('should coerce types for in comparison', () => {
      expect(evaluateFilter({ $in: { 'data.amount': ['5000', 6000] } }, baseEvent)).toBe(true);
    });
  });

  describe('$nin operator', () => {
    it('should match value not in array', () => {
      expect(
        evaluateFilter({ $nin: { type: ['invoice.created', 'invoice.paid'] } }, baseEvent),
      ).toBe(true);
    });

    it('should not match value in array', () => {
      expect(evaluateFilter({ $nin: { type: ['payment.completed'] } }, baseEvent)).toBe(false);
    });

    it('should return false when filter value is not an array', () => {
      expect(evaluateFilter({ $nin: { type: 'not-an-array' } }, baseEvent)).toBe(false);
    });
  });

  describe('$regex operator', () => {
    it('should match pattern', () => {
      expect(evaluateFilter({ $regex: { type: '^payment\\.' } }, baseEvent)).toBe(true);
    });

    it('should not match non-matching pattern', () => {
      expect(evaluateFilter({ $regex: { type: '^invoice' } }, baseEvent)).toBe(false);
    });

    it('should return false for invalid regex', () => {
      expect(evaluateFilter({ $regex: { type: '[invalid' } }, baseEvent)).toBe(false);
    });

    it('should return false when filter value is not a string', () => {
      expect(evaluateFilter({ $regex: { type: 123 } }, baseEvent)).toBe(false);
    });
  });

  describe('$exists operator', () => {
    it('should return true when field exists with $exists: true', () => {
      expect(evaluateFilter({ $exists: { 'data.amount': true } }, baseEvent)).toBe(true);
    });

    it('should return false when field does not exist with $exists: true', () => {
      expect(evaluateFilter({ $exists: { nonexistent: true } }, baseEvent)).toBe(false);
    });

    it('should return true when field does not exist with $exists: false', () => {
      expect(evaluateFilter({ $exists: { nonexistent: false } }, baseEvent)).toBe(true);
    });

    it('should return false when field exists with $exists: false', () => {
      expect(evaluateFilter({ $exists: { type: false } }, baseEvent)).toBe(false);
    });
  });

  describe('$and operator', () => {
    it('should match when all conditions are true', () => {
      const filter = {
        $and: [{ $eq: { type: 'payment.completed' } }, { $eq: { source: 'stripe' } }],
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(true);
    });

    it('should not match when one condition is false', () => {
      const filter = {
        $and: [{ $eq: { type: 'payment.completed' } }, { $eq: { source: 'github' } }],
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(false);
    });
  });

  describe('$or operator', () => {
    it('should match when at least one condition is true', () => {
      const filter = {
        $or: [{ $eq: { type: 'payment.failed' } }, { $eq: { source: 'stripe' } }],
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(true);
    });

    it('should not match when all conditions are false', () => {
      const filter = {
        $or: [{ $eq: { type: 'payment.failed' } }, { $eq: { source: 'github' } }],
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(false);
    });
  });

  describe('$not operator', () => {
    it('should negate a matching condition', () => {
      expect(evaluateFilter({ $not: { $eq: { type: 'payment.failed' } } }, baseEvent)).toBe(true);
    });

    it('should negate a non-matching condition to false', () => {
      expect(evaluateFilter({ $not: { $eq: { type: 'payment.completed' } } }, baseEvent)).toBe(
        false,
      );
    });

    it('should work with compound conditions', () => {
      const filter = {
        $not: {
          $and: [{ $eq: { type: 'payment.completed' } }, { $eq: { source: 'stripe' } }],
        },
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(false);
    });
  });

  describe('nested dot-notation', () => {
    it('should resolve nested paths', () => {
      expect(evaluateFilter({ $eq: { 'data.amount': 5000 } }, baseEvent)).toBe(true);
      expect(evaluateFilter({ $eq: { 'data.currency': 'usd' } }, baseEvent)).toBe(true);
    });

    it('should return undefined for missing nested path', () => {
      expect(evaluateFilter({ $eq: { 'data.foo.bar.baz': 'value' } }, baseEvent)).toBe(false);
    });

    it('should handle null intermediate value', () => {
      const eventWithNull = { ...baseEvent, metadata: null };
      expect(evaluateFilter({ $eq: { 'metadata.foo': 'bar' } }, eventWithNull)).toBe(false);
    });

    it('should return undefined when intermediate path value is primitive', () => {
      expect(evaluateFilter({ $eq: { 'data.amount.nested': 'value' } }, baseEvent)).toBe(false);
    });
  });

  describe('combined operators', () => {
    it('should support combining $eq with $and', () => {
      const filter = {
        $and: [
          { $eq: { type: 'payment.completed' } },
          { $gte: { 'data.amount': 1000 } },
          { $lte: { 'data.amount': 10000 } },
          { $in: { source: ['stripe', 'github'] } },
        ],
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(true);
    });

    it('should support mixed operators at top level', () => {
      const filter = {
        $eq: { source: 'stripe' },
        $gte: { 'data.amount': 1000 },
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(true);
    });

    it('should short-circuit on first failing condition', () => {
      const filter = {
        $eq: { type: 'payment.failed' },
        $gte: { 'data.amount': 1000 },
      };
      expect(evaluateFilter(filter, baseEvent)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle missing event fields', () => {
      expect(evaluateFilter({ $eq: { nonexistent: 'value' } }, baseEvent)).toBe(false);
    });

    it('should handle boolean field values', () => {
      const event = { ...baseEvent, processed: true };
      expect(evaluateFilter({ $eq: { processed: true } }, event)).toBe(true);
      expect(evaluateFilter({ $eq: { processed: false } }, event)).toBe(false);
    });

    it('should handle numeric coercion from event side', () => {
      const event = { ...baseEvent, retryCount: '3' };
      expect(evaluateFilter({ $gte: { retryCount: 3 } }, event)).toBe(true);
      expect(evaluateFilter({ $eq: { retryCount: 3 } }, event)).toBe(true);
    });

    it('should return false for unknown operator in top-level field key', () => {
      expect(evaluateFilter({ type: 'payment.completed' }, baseEvent)).toBe(true);
    });

    it('should return false for unknown operator', () => {
      expect(evaluateFilter({ $unknown: { type: 'test' } }, baseEvent)).toBe(false);
    });
  });
});
