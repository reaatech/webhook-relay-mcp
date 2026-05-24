import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webhookRouter } from '../../src/ingest.js';

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const mockIncrementCounter = vi.hoisted(() => vi.fn());
const mockDecryptSecret = vi.hoisted(() => vi.fn((s: string) => s));
const mockEventsFindByWebhookId = vi.hoisted(() => vi.fn());
const mockEventsCreate = vi.hoisted(() => vi.fn());
const mockSourcesFindByName = vi.hoisted(() => vi.fn());
const mockPollWaiterNotify = vi.hoisted(() => vi.fn());
const mockSourceHealthRecordEvent = vi.hoisted(() => vi.fn());
const mockAuditLog = vi.hoisted(() => vi.fn());
const mockRateLimitMiddleware = vi.hoisted(() => vi.fn());

vi.mock('@reaatech/webhook-relay-core', () => ({
  config: { rateLimitWindowMs: 60000, rateLimitMaxRequests: 100 },
  logger: mockLogger,
  decryptSecret: mockDecryptSecret,
  SignatureVerificationError: class extends Error {
    constructor(m: string) {
      super(m);
      this.name = 'SignatureVerificationError';
    }
  },
  incrementCounter: mockIncrementCounter,
}));

vi.mock('@reaatech/webhook-relay-storage', () => ({
  StorageService: {
    getInstance: vi.fn(() => ({
      events: { findByWebhookId: mockEventsFindByWebhookId, create: mockEventsCreate },
      sources: { findByName: mockSourcesFindByName },
    })),
  },
  PollWaiterService: {
    getInstance: vi.fn(() => ({ notify: mockPollWaiterNotify })),
  },
  SourceHealthService: {
    getInstance: vi.fn(() => ({ recordEvent: mockSourceHealthRecordEvent })),
  },
  AuditService: {
    getInstance: vi.fn(() => ({ log: mockAuditLog })),
  },
}));

vi.mock('../../src/middleware/rateLimit.js', () => ({
  rateLimit: () => mockRateLimitMiddleware,
}));

function getHandler(method: string, path: string): (...args: unknown[]) => unknown {
  const stack = (webhookRouter as unknown as { stack: Array<Record<string, unknown>> }).stack;
  for (const layer of stack) {
    const route = layer.route as Record<string, unknown> | undefined;
    if (route?.path === path && (route?.methods as Record<string, boolean>)[method.toLowerCase()]) {
      const routeStack = route.stack as Array<{ handle: (...args: unknown[]) => unknown }>;
      return routeStack[0].handle;
    }
  }
  throw new Error(`Handler not found: ${method} ${path}`);
}

interface CallResult {
  statusCode: number;
  body: unknown;
  req: Record<string, unknown>;
  res: Record<string, unknown>;
}

type ReqWithHeaders = {
  method: string;
  params: Record<string, string>;
  headers: Record<string, string>;
  get: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
};

async function callHandler(
  method: string,
  path: string,
  overrides: Record<string, unknown> = {},
): Promise<CallResult> {
  const handler = getHandler(method, path);
  let statusCode = 200;
  let body: unknown;

  const req: ReqWithHeaders = {
    method,
    params: {},
    headers: {},
    get: vi.fn(
      (name: string) => (req as ReqWithHeaders).headers[name.toLowerCase()] as string | undefined,
    ),
    ...overrides,
  };

  const res: {
    status: (code: number) => typeof res;
    json: (b: unknown) => typeof res;
    send: (b: unknown) => typeof res;
  } = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((b: unknown) => {
      body = b;
      return res;
    }),
    send: vi.fn((b: unknown) => {
      body = b;
      return res;
    }),
  };

  await handler(req, res);

  return { statusCode, body, req, res };
}

describe('webhookRouter POST /:name', () => {
  const activeSource = {
    id: 'src-1',
    name: 'test-source',
    sourceType: 'generic',
    signingSecret: 'test-secret',
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSourceHealthRecordEvent.mockResolvedValue(undefined);
    mockAuditLog.mockResolvedValue(undefined);
    mockPollWaiterNotify.mockResolvedValue(undefined);
    mockEventsCreate.mockResolvedValue({ id: 'evt-1' });
  });

  it('should process a valid webhook and return 202', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);
    mockEventsFindByWebhookId.mockResolvedValue(null);

    const rawBody = Buffer.from(JSON.stringify({ event: 'test' }));
    const signature = crypto.createHmac('sha256', 'test-secret').update(rawBody).digest('hex');

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: { 'x-request-id': 'req-1', 'user-agent': 'test-agent', 'x-signature': signature },
      body: { event: 'test' },
      rawBody,
    });

    expect(result.statusCode).toBe(202);
    expect(result.body).toEqual({ status: 'accepted', eventId: expect.any(String) });
    expect(mockSourcesFindByName).toHaveBeenCalledWith('test-source');
    expect(mockIncrementCounter).toHaveBeenCalledWith('webhook_received_total', {
      source: 'test-source',
    });
    expect(mockIncrementCounter).toHaveBeenCalledWith('webhook_ingested_total', {
      event_type: expect.any(String),
      source: 'test-source',
    });
    expect(mockEventsCreate).toHaveBeenCalled();
    expect(mockPollWaiterNotify).toHaveBeenCalled();
    expect(mockSourceHealthRecordEvent).toHaveBeenCalledWith('test-source');
    expect(mockAuditLog).toHaveBeenCalledWith(
      'system',
      'webhook_received',
      'source',
      'test-source',
    );
  });

  it('should return 404 when source is not found', async () => {
    mockSourcesFindByName.mockResolvedValue(null);

    const result = await callHandler('post', '/:name', {
      params: { name: 'unknown-source' },
      headers: {},
      body: {},
      rawBody: Buffer.from('{}'),
    });

    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({ error: 'Webhook source not configured' });
  });

  it('should return 404 when source is inactive', async () => {
    mockSourcesFindByName.mockResolvedValue({ ...activeSource, isActive: false });

    const result = await callHandler('post', '/:name', {
      params: { name: 'inactive-source' },
      headers: {},
      body: {},
      rawBody: Buffer.from('{}'),
    });

    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({ error: 'Webhook source not configured' });
  });

  it('should return 404 when source type is unknown', async () => {
    mockSourcesFindByName.mockResolvedValue({
      ...activeSource,
      sourceType: 'nonexistent-type',
    });

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: {},
      body: {},
      rawBody: Buffer.from('{}'),
    });

    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({ error: 'Unknown webhook source type' });
  });

  it('should return 401 when signature validation fails (missing header)', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: {},
      body: {},
      rawBody: Buffer.from('{}'),
    });

    expect(result.statusCode).toBe(401);
    expect(result.body).toEqual({ error: 'Invalid signature' });
  });

  it('should return 401 when signature validation returns false', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);

    const rawBody = Buffer.from(JSON.stringify({ event: 'test' }));
    const wrongSig = crypto.createHmac('sha256', 'wrong-secret').update(rawBody).digest('hex');

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: { 'x-signature': wrongSig },
      body: { event: 'test' },
      rawBody,
    });

    expect(result.statusCode).toBe(401);
    expect(result.body).toEqual({ error: 'Invalid signature' });
  });

  it('should return 200 duplicate when webhook id matches existing event', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);
    mockEventsFindByWebhookId.mockResolvedValue({ id: 'existing-evt' });

    const rawBody = Buffer.from(JSON.stringify({ id: 'dup-1' }));
    const signature = crypto.createHmac('sha256', 'test-secret').update(rawBody).digest('hex');

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: { 'x-signature': signature },
      body: { id: 'dup-1' },
      rawBody,
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ status: 'duplicate' });
  });

  it('should handle SourceHealthService recordEvent failure gracefully', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);
    mockEventsFindByWebhookId.mockResolvedValue(null);
    mockSourceHealthRecordEvent.mockRejectedValue(new Error('Health service down'));

    const rawBody = Buffer.from(JSON.stringify({ event: 'test' }));
    const signature = crypto.createHmac('sha256', 'test-secret').update(rawBody).digest('hex');

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: { 'x-signature': signature },
      body: { event: 'test' },
      rawBody,
    });

    expect(result.statusCode).toBe(202);
  });

  it('should handle AuditService log failure gracefully', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);
    mockEventsFindByWebhookId.mockResolvedValue(null);
    mockAuditLog.mockRejectedValue(new Error('Audit service down'));

    const rawBody = Buffer.from(JSON.stringify({ event: 'test' }));
    const signature = crypto.createHmac('sha256', 'test-secret').update(rawBody).digest('hex');

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: { 'x-signature': signature },
      body: { event: 'test' },
      rawBody,
    });

    expect(result.statusCode).toBe(202);
  });

  it('should continue processing when webhookId exists but no duplicate found', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);
    mockEventsFindByWebhookId.mockResolvedValue(null);

    const rawBody = Buffer.from(JSON.stringify({ id: 'unique-1', event: 'test' }));
    const signature = crypto.createHmac('sha256', 'test-secret').update(rawBody).digest('hex');

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: { 'x-signature': signature },
      body: { id: 'unique-1', event: 'test' },
      rawBody,
    });

    expect(result.statusCode).toBe(202);
    expect(mockEventsFindByWebhookId).toHaveBeenCalledWith('generic', 'unique-1');
  });

  it('should handle non-Error thrown in signature validation', async () => {
    mockSourcesFindByName.mockResolvedValue(activeSource);
    mockDecryptSecret.mockImplementationOnce(() => {
      throw 'raw string error';
    });

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: {},
      body: {},
      rawBody: Buffer.from('{}'),
    });

    expect(result.statusCode).toBe(401);
    expect(result.body).toEqual({ error: 'Invalid signature' });
  });

  it('should handle non-Error thrown in main processing', async () => {
    mockSourcesFindByName.mockRejectedValue('raw string error');

    const result = await callHandler('post', '/:name', {
      params: { name: 'test-source' },
      headers: {},
      body: {},
      rawBody: Buffer.from('{}'),
    });

    expect(result.statusCode).toBe(500);
    expect(result.body).toEqual({ error: 'Internal server error' });
  });
});

describe('webhookRouter GET /:name/verify', () => {
  it('should return 200 with status for a simple verify', async () => {
    const result = await callHandler('get', '/:name/verify', {
      params: { name: 'test-source' },
      query: {},
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ status: 'ok', name: 'test-source' });
  });

  it('should return hub.challenge for URL verification', async () => {
    const result = await callHandler('get', '/:name/verify', {
      params: { name: 'test-source' },
      query: { 'hub.mode': 'subscribe', 'hub.challenge': 'challenge-123' },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('challenge-123');
  });
});
