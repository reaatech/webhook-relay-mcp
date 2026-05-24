import crypto from 'node:crypto';
import { GitHubWebhookSource } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';
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

    it('should throw when signature header is missing', async () => {
      const req = createMockRequest({}, 'push');
      req.headers['x-hub-signature-256'] = undefined;
      await expect(source.validateSignature(req, secret)).rejects.toThrow(
        'Missing X-Hub-Signature-256 header',
      );
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

    it('should normalize pull_request.opened', async () => {
      const body = {
        action: 'opened',
        number: 42,
        pull_request: {
          id: 100,
          number: 42,
          state: 'open',
          title: 'Test PR',
          head: { ref: 'feature' },
        },
        repository: { full_name: 'test/repo' },
        sender: { login: 'testuser' },
      };
      const req = createMockRequest(body, 'pull_request', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('code.pull_request.opened');
      expect(event.correlationId).toBe('100');
      expect(event.data.number).toBe(42);
      expect(event.data.title).toBe('Test PR');
      expect(event.data.branch).toBe('feature');
    });

    it('should normalize release.published', async () => {
      const body = {
        action: 'published',
        release: {
          id: 200,
          tag_name: 'v1.0',
          name: 'Release v1.0',
          draft: false,
          prerelease: false,
        },
        repository: { full_name: 'test/repo' },
        sender: { login: 'testuser' },
      };
      const req = createMockRequest(body, 'release', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('release.published');
      expect(event.correlationId).toBe('200');
      expect(event.data.tagName).toBe('v1.0');
      expect(event.data.releaseName).toBe('Release v1.0');
    });

    it('should normalize deployment_status.completed', async () => {
      const body = {
        action: 'completed',
        deployment_status: { id: 300, state: 'success' },
        deployment: { id: 301, environment: 'production' },
        repository: { full_name: 'test/repo' },
        sender: { login: 'testuser' },
      };
      const req = createMockRequest(body, 'deployment_status', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('deployment.completed');
      expect(event.data.state).toBe('success');
      expect(event.data.environment).toBe('production');
    });

    it('should use github. prefix for unmapped events', async () => {
      const body = { action: 'created', repository: { full_name: 'test/repo' } };
      const req = createMockRequest(body, 'custom_event', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('github.custom_event.created');
    });

    it('should handle events without action', async () => {
      const body = { repository: { full_name: 'test/repo' } };
      const req = createMockRequest(body, 'ping', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('github.ping');
    });

    it('should set metadata with repository and sender info', async () => {
      const body = {
        action: 'opened',
        repository: { full_name: 'test/repo' },
        sender: { login: 'testuser' },
        installation: { id: 42 },
      };
      const req = createMockRequest(body, 'issues', 'test-sig');
      req.headers['x-github-delivery'] = 'delivery-456';
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.metadata.repository).toBe('test/repo');
      expect(event.metadata.sender).toBe('testuser');
      expect(event.metadata.installation).toBe(42);
    });

    it('should use x-github-delivery-at for timestamp', async () => {
      const body = { action: 'opened', repository: { full_name: 'test/repo' } };
      const req = createMockRequest(body, 'pull_request', 'test-sig');
      req.headers['x-github-delivery-at'] = '2024-01-15T10:00:00Z';
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.timestamp).toBe('2024-01-15T10:00:00Z');
    });

    it('should handle push event without commits', async () => {
      const body = {
        ref: 'refs/heads/main',
        before: 'abc123',
        after: 'def456',
        pusher: { name: 'testuser' },
        repository: { full_name: 'test/repo' },
      };
      const req = createMockRequest(body, 'push', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.data.commitCount).toBe(0);
    });

    it('should handle release without release id in extractCorrelationId', async () => {
      const body = {
        action: 'published',
        release: { tag_name: 'v1.0', name: 'Release' },
        repository: { full_name: 'test/repo' },
      };
      const req = createMockRequest(body, 'release', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.correlationId).toBe('');
    });

    it('should handle workflow_run without id', async () => {
      const body = {
        action: 'completed',
        workflow_run: { status: 'completed', conclusion: 'success' },
        repository: { full_name: 'test/repo' },
      };
      const req = createMockRequest(body, 'workflow_run', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.correlationId).toBe('');
    });
  });

  describe('getEventType', () => {
    it('should extract event type from request', () => {
      const body = { action: 'opened' };
      const req = createMockRequest(body, 'pull_request');
      expect(source.getEventType(req)).toBe('code.pull_request.opened');
    });

    it('should use github. prefix for unmapped event types', () => {
      const body = { action: 'created' };
      const req = createMockRequest(body, 'deployment');
      expect(source.getEventType(req)).toBe('github.deployment.created');
    });

    it('should handle events without action', () => {
      const body = {};
      const req = createMockRequest(body, 'ping');
      expect(source.getEventType(req)).toBe('github.ping');
    });
  });

  describe('getWebhookId', () => {
    it('should return the delivery id', () => {
      const req = createMockRequest({}, 'push');
      expect(source.getWebhookId(req)).toBe('delivery-123');
    });

    it('should return undefined when no delivery header', () => {
      const req = createMockRequest({}, 'push');
      req.headers['x-github-delivery'] = undefined;
      expect(source.getWebhookId(req)).toBeUndefined();
    });
  });

  describe('extractCorrelationId - default case', () => {
    it('should return undefined for events without correlation id', async () => {
      const body = {
        action: 'opened',
        repository: { full_name: 'test/repo' },
        sender: { login: 'testuser' },
      };
      const req = createMockRequest(body, 'issues', 'test-sig');
      req.rawBody = Buffer.from(JSON.stringify(body));
      const event = await source.normalizePayload(req);
      expect(event.correlationId).toBeUndefined();
    });
  });
});
