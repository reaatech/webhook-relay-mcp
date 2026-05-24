import * as core from '@reaatech/webhook-relay-core';
import { describe, expect, it } from 'vitest';

describe('barrel exports', () => {
  it('should export config', () => {
    expect(core.config).toBeDefined();
    expect(typeof core.config.port).toBe('number');
    expect(typeof core.config.nodeEnv).toBe('string');
    expect(typeof core.config.encryptionKey).toBe('string');
  });

  it('should export NormalizedEvent and NormalizationContext types', () => {
    expect(core).toBeDefined();
  });

  it('should export encryptSecret and decryptSecret', () => {
    expect(typeof core.encryptSecret).toBe('function');
    expect(typeof core.decryptSecret).toBe('function');
  });

  it('should export error classes', () => {
    expect(core.WebhookRelayError).toBeDefined();
    expect(core.SignatureVerificationError).toBeDefined();
    expect(core.ValidationError).toBeDefined();
    expect(core.NotFoundError).toBeDefined();
    expect(core.ConflictError).toBeDefined();
  });

  it('should export evaluateFilter', () => {
    expect(typeof core.evaluateFilter).toBe('function');
  });

  it('should export matchEventType', () => {
    expect(typeof core.matchEventType).toBe('function');
  });

  it('should export validation schemas', () => {
    expect(core.subscribeSchema).toBeDefined();
    expect(core.pollSchema).toBeDefined();
    expect(core.historySchema).toBeDefined();
    expect(core.registerSourceSchema).toBeDefined();
    expect(core.statsSchema).toBeDefined();
    expect(core.replaySchema).toBeDefined();
    expect(core.updateSourceSchema).toBeDefined();
    expect(core.deleteSourceSchema).toBeDefined();
    expect(core.rotateSecretSchema).toBeDefined();
    expect(core.listSourcesSchema).toBeDefined();
    expect(core.auditLogSchema).toBeDefined();
    expect(core.sourceHealthSchema).toBeDefined();
    expect(core.eventTypesSchema).toBeDefined();
  });

  it('should export metrics functions', () => {
    expect(typeof core.incrementCounter).toBe('function');
    expect(typeof core.setGauge).toBe('function');
    expect(typeof core.registerMetric).toBe('function');
    expect(typeof core.getMetricsText).toBe('function');
  });

  it('should export logger instance', () => {
    expect(core.logger).toBeDefined();
    expect(typeof core.logger.info).toBe('function');
  });
});
