import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/server.js';
import { StorageService } from '../../src/storage/index.js';
import { encryptSecret } from '../../src/utils/crypto.js';

const app = createApp();

describe('Webhook Ingestion', () => {
  beforeEach(async () => {
    const storage = StorageService.getInstance();
    await storage.initialize();
  });

  it('should return 404 for unconfigured source', async () => {
    const res = await request(app)
      .post('/webhooks/unknown-source')
      .set('Content-Type', 'application/json')
      .send({ type: 'test' });

    expect(res.status).toBe(404);
  });

  it('should reject invalid signature', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'stripe-test',
      sourceType: 'stripe',
      endpointUrl: 'http://localhost/webhooks/stripe-test',
      signingSecret: encryptSecret('whsec_test'),
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/webhooks/stripe-test')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=123,v1=invalid')
      .send({ id: 'evt_123', type: 'test' });

    expect(res.status).toBe(401);
  });

  it('should accept valid GitHub webhook', async () => {
    const storage = StorageService.getInstance();
    const secret = 'github_secret';
    await storage.sources.create({
      name: 'github-test',
      sourceType: 'github',
      endpointUrl: 'http://localhost/webhooks/github-test',
      signingSecret: encryptSecret(secret),
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const payload = { action: 'opened', repository: { full_name: 'test/repo' } };
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    const res = await request(app)
      .post('/webhooks/github-test')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-Hub-Signature-256', signature)
      .set('X-GitHub-Delivery', 'del-123')
      .send(payload);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(res.body.eventId).toBeDefined();

    const events = await storage.events.list({ sources: ['github'] });
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('code.pull_request.opened');
    expect(events[0]?.source).toBe('github');
  });

  it('should deduplicate webhooks by webhookId', async () => {
    const storage = StorageService.getInstance();
    const secret = 'github_secret';
    await storage.sources.create({
      name: 'github-dedup',
      sourceType: 'github',
      endpointUrl: 'http://localhost/webhooks/github-dedup',
      signingSecret: encryptSecret(secret),
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const payload = { action: 'opened', repository: { full_name: 'test/repo' } };
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    // Send same webhook twice
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post('/webhooks/github-dedup')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .set('X-GitHub-Delivery', 'del-dedup')
        .send(payload);
    }

    const events = await storage.events.list({ sources: ['github'] });
    const dedupEvents = events.filter((e) => e.metadata?.webhookId === 'del-dedup');
    expect(dedupEvents.length).toBe(1);
  });

  it('should return 404 for unknown source type', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'unknown-type',
      sourceType: 'nonexistent',
      endpointUrl: 'http://localhost/webhooks/unknown-type',
      signingSecret: encryptSecret('secret'),
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/webhooks/unknown-type')
      .set('Content-Type', 'application/json')
      .send({ type: 'test' });

    expect(res.status).toBe(404);
  });

  it('should handle generic webhook with valid signature', async () => {
    const storage = StorageService.getInstance();
    await storage.sources.create({
      name: 'generic-test',
      sourceType: 'generic',
      endpointUrl: 'http://localhost/webhooks/generic-test',
      signingSecret: encryptSecret('secret'),
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const body = JSON.stringify({ event: 'user.created', id: 'evt-1' });
    const signature = crypto.createHmac('sha256', 'secret').update(body).digest('hex');

    const res = await request(app)
      .post('/webhooks/generic-test')
      .set('Content-Type', 'application/json')
      .set('x-signature', signature)
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');

    const events = await storage.events.list({ sources: ['generic'] });
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('generic.user.created');
  });
});

describe('Webhook Verify Endpoint', () => {
  const app = createApp();

  it('should respond to hub challenge', async () => {
    const res = await request(app).get(
      '/webhooks/test/verify?hub.mode=subscribe&hub.challenge=abc123'
    );

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('should return ok without hub challenge', async () => {
    const res = await request(app).get('/webhooks/test/verify');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.name).toBe('test');
  });
});
