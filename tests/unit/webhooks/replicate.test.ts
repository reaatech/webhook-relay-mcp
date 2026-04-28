import { describe, it, expect } from 'vitest';
import { ReplicateWebhookSource } from '../../../src/webhooks/sources/replicate.js';
import predictionCompletedFixture from '../../fixtures/replicate/prediction-completed.json' with { type: 'json' };

describe('ReplicateWebhookSource', () => {
  const source = new ReplicateWebhookSource();

  function createMockRequest(body: unknown): Parameters<typeof source.normalizePayload>[0] {
    return {
      body,
      rawBody: Buffer.from(JSON.stringify(body)),
      headers: {},
    } as unknown as Parameters<typeof source.normalizePayload>[0];
  }

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

    it('should reject request without signature header', async () => {
      const req = createMockRequest(predictionCompletedFixture);
      await expect(source.validateSignature(req, 'any-secret')).rejects.toThrow(
        'Missing webhook-secret header'
      );
    });
  });
});
