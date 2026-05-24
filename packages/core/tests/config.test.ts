import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should use default values when env vars are not set', async () => {
    // biome-ignore lint/performance/noDelete:
    delete process.env.NODE_ENV;
    // biome-ignore lint/performance/noDelete:
    delete process.env.DATABASE_PATH;
    process.env.ENCRYPTION_KEY = 'test-key';

    const { config } = await import('../src/config.js');

    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.mcpTransport).toBe('stdio');
    expect(config.logLevel).toBe('info');
    expect(config.logFormat).toBe('json');
    expect(config.eventRetentionDays).toBe(30);
    expect(config.rateLimitWindowMs).toBe(60000);
    expect(config.rateLimitMaxRequests).toBe(100);
    expect(config.metricsEnabled).toBe(true);
    expect(config.deliveryRetryMax).toBe(5);
    expect(config.deliveryRetryBackoffMs).toBe(1000);
    expect(config.sourceHeartbeatMinutes).toBe(60);
    expect(config.adminApiKey).toBeUndefined();
    expect(config.mcpApiKey).toBeUndefined();
  });

  it('should apply env var overrides', async () => {
    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.NODE_ENV = 'production';
    process.env.PORT = '8080';
    process.env.HOST = '127.0.0.1';
    process.env.MCP_TRANSPORT = 'sse';
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FORMAT = 'pretty';
    process.env.WEBHOOK_BASE_URL = 'https://hooks.example.com';
    process.env.EVENT_RETENTION_DAYS = '90';
    process.env.ADMIN_API_KEY = 'admin-secret';
    process.env.RATE_LIMIT_WINDOW_MS = '30000';
    process.env.RATE_LIMIT_MAX_REQUESTS = '50';
    process.env.MCP_API_KEY = 'mcp-secret';
    process.env.METRICS_ENABLED = 'false';
    process.env.DELIVERY_RETRY_MAX = '10';
    process.env.DELIVERY_RETRY_BACKOFF_MS = '5000';
    process.env.SOURCE_HEARTBEAT_MINUTES = '30';
    process.env.DATABASE_PATH = '/tmp/test.db';

    const { config } = await import('../src/config.js');

    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.mcpTransport).toBe('sse');
    expect(config.logLevel).toBe('debug');
    expect(config.logFormat).toBe('pretty');
    expect(config.webhookBaseUrl).toBe('https://hooks.example.com');
    expect(config.eventRetentionDays).toBe(90);
    expect(config.adminApiKey).toBe('admin-secret');
    expect(config.rateLimitWindowMs).toBe(30000);
    expect(config.rateLimitMaxRequests).toBe(50);
    expect(config.mcpApiKey).toBe('mcp-secret');
    expect(config.metricsEnabled).toBe(true);
    expect(config.deliveryRetryMax).toBe(10);
    expect(config.deliveryRetryBackoffMs).toBe(5000);
    expect(config.sourceHeartbeatMinutes).toBe(30);
    expect(config.databasePath).toBe('/tmp/test.db');
  });

  it('should coerce port from string to number', async () => {
    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.PORT = '9090';

    const { config } = await import('../src/config.js');
    expect(config.port).toBe(9090);
    expect(typeof config.port).toBe('number');
  });

  it('should exit process on invalid NODE_ENV', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.NODE_ENV = 'invalid-env';

    await import('../src/config.js');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should exit process on missing ENCRYPTION_KEY', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // biome-ignore lint/performance/noDelete:
    delete process.env.ENCRYPTION_KEY;

    await import('../src/config.js');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should validate NODE_ENV enum values', async () => {
    process.env.ENCRYPTION_KEY = 'test-key';
    process.env.NODE_ENV = 'development';
    const { config: devConfig } = await import('../src/config.js');
    expect(devConfig.nodeEnv).toBe('development');
  });
});
