import crypto from 'node:crypto';
import { ReplicateWebhookSource } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';
import predictionCompletedFixture from '../../fixtures/replicate/prediction-completed.json' with {
  type: 'json',
};

describe('ReplicateWebhookSource', () => {
  const source = new ReplicateWebhookSource();
  const secret = 'replicate_secret_key';

  function createMockRequest(
    body: unknown,
    headers: Record<string, string> = {},
  ): Parameters<typeof source.normalizePayload>[0] {
    return {
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
      headers,
    } as unknown as Parameters<typeof source.normalizePayload>[0];
  }

  describe('validateSignature', () => {
    it('should reject request without signature header', async () => {
      const req = createMockRequest(predictionCompletedFixture);
      await expect(source.validateSignature(req, 'any-secret')).rejects.toThrow(
        'Missing webhook-secret header',
      );
    });

    it('should validate a correct HMAC signature', async () => {
      const body = { id: 'pred_1', status: 'succeeded' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const hmac = crypto.createHmac('sha256', secret);
      const expectedSig = hmac.update(rawBody).digest('hex');

      const req = createMockRequest(body, { 'webhook-secret': expectedSig });
      req.rawBody = rawBody;

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(true);
    });

    it('should reject an invalid HMAC signature', async () => {
      const body = { id: 'pred_1', status: 'succeeded' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const wrongHmac = crypto.createHmac('sha256', 'wrong_secret');
      const wrongSig = wrongHmac.update(rawBody).digest('hex');

      const req = createMockRequest(body, { 'webhook-secret': wrongSig });
      req.rawBody = rawBody;

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(false);
    });

    it('should reject signature with different length', async () => {
      const body = { id: 'pred_1', status: 'succeeded' };
      const req = createMockRequest(body, { 'webhook-secret': 'tooshort' });
      req.rawBody = Buffer.from(JSON.stringify(body));

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(false);
    });
  });

  describe('normalizePayload', () => {
    it('should normalize succeeded prediction', async () => {
      const req = createMockRequest(predictionCompletedFixture);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('prediction.completed');
      expect(event.source).toBe('replicate');
      expect(event.correlationId).toBe('pred_test_123');
      expect(event.data.status).toBe('succeeded');
      expect(event.data.predictTime).toBe(12.34);
    });

    it('should derive event type from status', async () => {
      const body = {
        id: 'pred_1',
        version: 'v1',
        status: 'failed',
        created_at: '2024-01-01T00:00:00Z',
      };
      const req = createMockRequest(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('prediction.failed');
    });

    it('should handle starting status', async () => {
      const body = {
        id: 'pred_start',
        version: 'v1',
        status: 'starting',
        created_at: '2024-01-01T00:00:00Z',
      };
      const req = createMockRequest(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('prediction.started');
    });

    it('should handle processing status', async () => {
      const body = {
        id: 'pred_proc',
        version: 'v1',
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
      };
      const req = createMockRequest(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('prediction.processing');
    });

    it('should handle canceled status', async () => {
      const body = {
        id: 'pred_cancel',
        version: 'v1',
        status: 'canceled',
        created_at: '2024-01-01T00:00:00Z',
      };
      const req = createMockRequest(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('prediction.canceled');
    });

    it('should use replicate. prefix for unknown statuses', async () => {
      const body = {
        id: 'pred_unknown',
        version: 'v1',
        status: 'unknown_status',
        created_at: '2024-01-01T00:00:00Z',
      };
      const req = createMockRequest(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('replicate.prediction.unknown_status');
    });

    it('should use completed_at as timestamp when available', async () => {
      const req = createMockRequest(predictionCompletedFixture);
      const event = await source.normalizePayload(req);
      expect(event.timestamp).toBe('2024-01-15T10:00:17Z');
    });

    it('should fall back to started_at when no completed_at', async () => {
      const body = {
        id: 'pred_2',
        version: 'v1',
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
        started_at: '2024-01-01T00:01:00Z',
      };
      const req = createMockRequest(body);
      const event = await source.normalizePayload(req);
      expect(event.timestamp).toBe('2024-01-01T00:01:00Z');
    });

    it('should fall back to created_at when no started_at or completed_at', async () => {
      const body = {
        id: 'pred_3',
        version: 'v1',
        status: 'starting',
        created_at: '2024-01-01T00:00:00Z',
      };
      const req = createMockRequest(body);
      const event = await source.normalizePayload(req);
      expect(event.timestamp).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('getEventType', () => {
    it('should return event type for succeeded status', () => {
      const req = createMockRequest({ id: 'pred_1', status: 'succeeded' });
      expect(source.getEventType(req)).toBe('prediction.completed');
    });

    it('should return event type for failed status', () => {
      const req = createMockRequest({ id: 'pred_1', status: 'failed' });
      expect(source.getEventType(req)).toBe('prediction.failed');
    });

    it('should return event type for processing status', () => {
      const req = createMockRequest({ id: 'pred_1', status: 'processing' });
      expect(source.getEventType(req)).toBe('prediction.processing');
    });

    it('should return replicate. prefix for unknown statuses', () => {
      const req = createMockRequest({ id: 'pred_1', status: 'unknown' });
      expect(source.getEventType(req)).toBe('replicate.prediction.unknown');
    });
  });

  describe('getWebhookId', () => {
    it('should return the prediction id', () => {
      const req = createMockRequest({ id: 'pred_1', status: 'succeeded' });
      expect(source.getWebhookId(req)).toBe('pred_1');
    });

    it('should return undefined when no id present', () => {
      const req = createMockRequest({ status: 'succeeded' });
      expect(source.getWebhookId(req)).toBeUndefined();
    });
  });
});
