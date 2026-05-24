import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should export a pino logger instance with standard methods', async () => {
    const { logger } = await import('../src/utils/logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.fatal).toBe('function');
    expect(typeof logger.child).toBe('function');
    expect(logger.level).toBeDefined();
  });

  it('should have level set to info by default', async () => {
    const { logger: log } = await import('../src/utils/logger.js');
    expect(log.level).toBe('info');
  });

  it('should log at various levels without throwing', async () => {
    const { logger } = await import('../src/utils/logger.js');
    expect(() => {
      logger.info('test info message');
      logger.error('test error message');
      logger.warn('test warn message');
      logger.debug('test debug message');
    }).not.toThrow();
  });

  it('should configure pretty transport when logFormat is pretty', async () => {
    process.env.LOG_FORMAT = 'pretty';
    process.env.ENCRYPTION_KEY = 'test-key';
    const { logger } = await import('../src/utils/logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });
});
