import crypto from 'node:crypto';
import { VercelWebhookSource } from '@reaatech/webhook-relay-webhooks';
import type { WebhookRequest } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';

describe('VercelWebhookSource', () => {
  const source = new VercelWebhookSource();
  const secret = 'vercel_test_secret';

  function createReq(
    body: unknown,
    headers: Record<string, string> = {},
    rawBody?: Buffer,
  ): WebhookRequest {
    return {
      body,
      headers,
      rawBody: rawBody ?? Buffer.from(JSON.stringify(body)),
    } as WebhookRequest;
  }

  describe('validateSignature', () => {
    it('should throw when signature header is missing', async () => {
      const req = createReq({});
      await expect(source.validateSignature(req, secret)).rejects.toThrow(
        'Missing x-vercel-signature header',
      );
    });

    it('should validate a correct HMAC-SHA1 signature', async () => {
      const body = {
        id: 'deploy_1',
        type: 'deployment.succeeded',
        createdAt: Date.now(),
        payload: {},
      };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

      const req = createReq(body, { 'x-vercel-signature': signature }, rawBody);
      const result = await source.validateSignature(req, secret);
      expect(result).toBe(true);
    });

    it('should reject an invalid signature', async () => {
      const body = {
        id: 'deploy_1',
        type: 'deployment.succeeded',
        createdAt: Date.now(),
        payload: {},
      };
      const rawBody = Buffer.from(JSON.stringify(body));
      const req = createReq(body, { 'x-vercel-signature': 'a'.repeat(40) }, rawBody);

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(false);
    });
  });

  describe('normalizePayload', () => {
    it('should normalize a deployment.succeeded event', async () => {
      const body = {
        id: 'vercel_evt_1',
        type: 'deployment.succeeded',
        createdAt: Date.now(),
        payload: {
          deployment: {
            id: 'dpl_abc123',
            name: 'my-app',
            url: 'my-app.vercel.app',
            state: 'READY',
            target: 'production',
          },
          project: { id: 'prj_xyz', name: 'my-app' },
          team: { id: 'team_1', name: 'My Team', slug: 'my-team' },
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('deployment.succeeded');
      expect(event.source).toBe('vercel');
      expect(event.correlationId).toBe('dpl_abc123');
      expect(event.data.deploymentId).toBe('dpl_abc123');
      expect(event.data.deploymentName).toBe('my-app');
      expect(event.data.deploymentUrl).toBe('my-app.vercel.app');
      expect(event.data.deploymentState).toBe('READY');
      expect(event.data.projectName).toBe('my-app');
    });

    it('should normalize a deployment.error event', async () => {
      const body = {
        id: 'vercel_evt_2',
        type: 'deployment.error',
        createdAt: Date.now(),
        payload: {
          deployment: { id: 'dpl_error', name: 'my-app', state: 'ERROR' },
          project: { id: 'prj_xyz', name: 'my-app' },
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('deployment.error');
      expect(event.data.deploymentState).toBe('ERROR');
    });

    it('should normalize a project.created event', async () => {
      const body = {
        id: 'vercel_evt_3',
        type: 'project.created',
        createdAt: Date.now(),
        payload: {
          project: { id: 'prj_new', name: 'new-project' },
          team: { id: 'team_1', name: 'My Team', slug: 'my-team' },
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('project.created');
      expect(event.data.projectId).toBe('prj_new');
      expect(event.data.projectName).toBe('new-project');
    });

    it('should normalize a domain.created event', async () => {
      const body = {
        id: 'vercel_evt_4',
        type: 'domain.created',
        createdAt: Date.now(),
        payload: {
          domain: { id: 'dom_1', name: 'example.com' },
          project: { id: 'prj_xyz', name: 'my-app' },
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('domain.created');
      expect(event.data.domainId).toBe('dom_1');
      expect(event.data.domainName).toBe('example.com');
    });

    it('should use vercel. prefix for unknown event types', async () => {
      const body = {
        id: 'vercel_evt_5',
        type: 'custom.event',
        createdAt: Date.now(),
        payload: {},
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('vercel.custom.event');
    });
  });

  describe('getWebhookId', () => {
    it('should return x-vercel-id header when present', () => {
      const req = createReq(
        { id: 'evt_1', type: 'deployment.succeeded', createdAt: Date.now(), payload: {} },
        { 'x-vercel-id': 'vercel-id-001' },
      );
      expect(source.getWebhookId(req)).toBe('vercel-id-001');
    });

    it('should fall back to deployment id from payload', () => {
      const req = createReq({
        id: 'evt_1',
        type: 'deployment.succeeded',
        createdAt: Date.now(),
        payload: { deployment: { id: 'dpl_123' } },
      });
      expect(source.getWebhookId(req)).toBe('dpl_123');
    });

    it('should return undefined when no identifier available', () => {
      const req = createReq({
        id: 'evt_1',
        type: 'custom.event',
        createdAt: Date.now(),
        payload: {},
      });
      expect(source.getWebhookId(req)).toBeUndefined();
    });
  });

  describe('getEventType', () => {
    it('should return mapped type for known events', () => {
      expect(source.getEventType(createReq({ type: 'deployment.succeeded' }))).toBe(
        'deployment.succeeded',
      );
      expect(source.getEventType(createReq({ type: 'deployment.created' }))).toBe(
        'deployment.created',
      );
      expect(source.getEventType(createReq({ type: 'deployment.error' }))).toBe('deployment.error');
    });

    it('should use vercel. prefix for unknown event types', () => {
      expect(source.getEventType(createReq({ type: 'custom.event' }))).toBe('vercel.custom.event');
    });
  });
});
