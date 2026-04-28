import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { GitHubWebhookSource } from '../../../src/webhooks/sources/github.js';
import pushFixture from '../../fixtures/github/push.json' with { type: 'json' };
import workflowRunFixture from '../../fixtures/github/workflow-run.json' with { type: 'json' };

describe('GitHubWebhookSource', () => {
  const source = new GitHubWebhookSource();
  const secret = 'github_test_secret';

  function createMockRequest(body: unknown, event: string, signature?: string) {
    const rawBody = Buffer.from(JSON.stringify(body));
    return {
      body,
      rawBody,
      headers: {
        'x-github-event': event,
        'x-hub-signature-256': signature,
        'x-github-delivery': 'delivery-123',
      },
    } as unknown as Parameters<typeof source.validateSignature>[0];
  }

  describe('validateSignature', () => {
    it('should validate a correct signature', async () => {
      const body = { action: 'opened' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const expectedSig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

      const req = createMockRequest(body, 'pull_request', expectedSig);
      req.rawBody = rawBody;

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(true);
    });

    it('should reject an invalid signature', async () => {
      const body = { action: 'opened' };
      const req = createMockRequest(body, 'pull_request', 'sha256=invalid');
      req.rawBody = Buffer.from(JSON.stringify(body));

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(false);
    });
  });

  describe('normalizePayload', () => {
    it('should normalize push event', async () => {
      const req = createMockRequest(pushFixture, 'push', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(pushFixture));

      const event = await source.normalizePayload(req);
      expect(event.type).toBe('code.push');
      expect(event.source).toBe('github');
      expect(event.data.ref).toBe('refs/heads/main');
      expect(event.data.commitCount).toBe(1);
    });

    it('should normalize workflow_run.completed', async () => {
      const req = createMockRequest(workflowRunFixture, 'workflow_run', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(workflowRunFixture));

      const event = await source.normalizePayload(req);
      expect(event.type).toBe('ci.workflow.completed');
      expect(event.data.status).toBe('completed');
      expect(event.data.conclusion).toBe('success');
    });
  });

  describe('getWebhookId', () => {
    it('should return the delivery id', () => {
      const req = createMockRequest({}, 'push');
      expect(source.getWebhookId(req)).toBe('delivery-123');
    });
  });
});
