import { matchEventType } from '@reaatech/webhook-relay-core';
import { describe, expect, it } from 'vitest';

describe('matchEventType', () => {
  it('should match exact pattern without wildcard', () => {
    expect(matchEventType('payment.completed', 'payment.completed')).toBe(true);
  });

  it('should not match different exact pattern', () => {
    expect(matchEventType('payment.completed', 'payment.failed')).toBe(false);
  });

  it('should match star wildcard for anything', () => {
    expect(matchEventType('*', 'payment.completed')).toBe(true);
    expect(matchEventType('*', '')).toBe(true);
    expect(matchEventType('*', 'anything.at.all')).toBe(true);
  });

  it('should match wildcard suffix with dot-star', () => {
    expect(matchEventType('payment.*', 'payment.completed')).toBe(true);
    expect(matchEventType('payment.*', 'payment.failed')).toBe(true);
    expect(matchEventType('payment.*', 'payment.completed.success')).toBe(true);
  });

  it('should not match wildcard when prefix differs', () => {
    expect(matchEventType('payment.*', 'invoice.created')).toBe(false);
  });

  it('should match with wildcard prefix', () => {
    expect(matchEventType('*.completed', 'payment.completed')).toBe(true);
    expect(matchEventType('*.completed', 'task.completed')).toBe(true);
  });

  it('should not match with wildcard prefix when suffix differs', () => {
    expect(matchEventType('*.completed', 'payment.failed')).toBe(false);
  });

  it('should match multiple wildcards', () => {
    expect(matchEventType('*.service.*', 'test.service.event')).toBe(true);
    expect(matchEventType('*.service.*', 'other.service.thing')).toBe(true);
  });

  it('should not match when segments differ with multiple wildcards', () => {
    expect(matchEventType('*.service.*', 'test.other.event')).toBe(false);
  });

  it('should match wildcard in middle of pattern', () => {
    expect(matchEventType('payment.*.completed', 'payment.stripe.completed')).toBe(true);
    expect(matchEventType('payment.*.completed', 'payment.manual.completed')).toBe(true);
  });
});
