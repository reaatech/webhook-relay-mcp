import crypto from 'node:crypto';
import type { WebhookRequest } from '@reaatech/webhook-relay-webhooks';
import { SlackWebhookSource } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';

describe('SlackWebhookSource', () => {
  const source = new SlackWebhookSource();
  const secret = 'slack_test_secret';

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
      const req = createReq({ type: 'event_callback' });
      await expect(source.validateSignature(req, secret)).rejects.toThrow(
        'Missing X-Slack-Signature header',
      );
    });

    it('should throw when timestamp header is missing', async () => {
      const req = createReq({ type: 'event_callback' }, { 'x-slack-signature': 'v0=abc' });
      await expect(source.validateSignature(req, secret)).rejects.toThrow(
        'Missing X-Slack-Request-Timestamp header',
      );
    });

    it('should validate a correct v0 signature', async () => {
      const body = { type: 'event_callback', event: { type: 'message', text: 'hello' } };
      const rawBody = Buffer.from(JSON.stringify(body));
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const baseString = `v0:${timestamp}:${rawBody.toString()}`;
      const signature = `v0=${crypto.createHmac('sha256', secret).update(baseString).digest('hex')}`;

      const req = createReq(
        body,
        {
          'x-slack-signature': signature,
          'x-slack-request-timestamp': timestamp,
        },
        rawBody,
      );

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(true);
    });

    it('should reject an invalid signature', async () => {
      const body = { type: 'event_callback' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const req = createReq(
        body,
        {
          'x-slack-signature': 'v0=invalid',
          'x-slack-request-timestamp': timestamp,
        },
        rawBody,
      );

      const result = await source.validateSignature(req, secret);
      expect(result).toBe(false);
    });
  });

  describe('normalizePayload', () => {
    it('should normalize a message event', async () => {
      const body = {
        token: 'test-token',
        team_id: 'T001',
        api_app_id: 'A001',
        type: 'event_callback',
        event_id: 'Evt_001',
        event_time: Math.floor(Date.now() / 1000),
        event: {
          type: 'message',
          channel: 'C001',
          user: 'U001',
          text: 'Hello world',
          ts: '1700000000.000001',
          event_ts: '1700000000.000001',
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('slack.message');
      expect(event.source).toBe('slack');
      expect(event.data.text).toBe('Hello world');
      expect(event.data.channel).toBe('C001');
      expect(event.data.user).toBe('U001');
      expect(event.metadata.teamId).toBe('T001');
      expect(event.metadata.webhookId).toBe('Evt_001');
    });

    it('should normalize a reaction_added event', async () => {
      const body = {
        type: 'event_callback',
        event_id: 'Evt_002',
        event_time: Math.floor(Date.now() / 1000),
        event: {
          type: 'reaction_added',
          reaction: 'thumbsup',
          user: 'U001',
          item: { type: 'message', channel: 'C001', ts: '1700000000.000001' },
          item_user: 'U002',
          event_ts: '1700000000.000002',
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('slack.reaction_added');
      expect(event.data.reaction).toBe('thumbsup');
      expect(event.data.itemUser).toBe('U002');
    });

    it('should normalize a channel_created event', async () => {
      const body = {
        type: 'event_callback',
        event_id: 'Evt_003',
        event_time: Math.floor(Date.now() / 1000),
        event: {
          type: 'channel_created',
          channel: { id: 'C002', name: 'general' },
          event_ts: '1700000000.000003',
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('slack.channel_created');
      expect(event.data.channelName).toBe('general');
      expect(event.data.channelId).toBe('C002');
    });

    it('should normalize a member_joined_channel event', async () => {
      const body = {
        type: 'event_callback',
        event_id: 'Evt_004',
        event_time: Math.floor(Date.now() / 1000),
        event: {
          type: 'member_joined_channel',
          channel: 'C001',
          user: 'U001',
          inviter: 'U002',
          event_ts: '1700000000.000004',
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('slack.member_joined_channel');
      expect(event.data.inviter).toBe('U002');
    });

    it('should handle url_verification by throwing', async () => {
      const body = { type: 'url_verification', challenge: 'abc123' };
      const req = createReq(body);

      await expect(source.normalizePayload(req)).rejects.toThrow(
        'URL verification challenge received',
      );
    });

    it('should use slack. prefix for unknown event types', async () => {
      const body = {
        type: 'event_callback',
        event_id: 'Evt_005',
        event_time: Math.floor(Date.now() / 1000),
        event: {
          type: 'custom_event',
          event_ts: '1700000000.000005',
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);

      expect(event.type).toBe('slack.custom_event');
    });
  });

  describe('normalizePayload - no event object', () => {
    it('should handle payload without nested event object', async () => {
      const body = {
        type: 'event_callback',
        team_id: 'T001',
        api_app_id: 'A001',
        event_id: 'Evt_NoEvent',
        event_time: Math.floor(Date.now() / 1000),
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('slack.event_callback');
      expect(event.data.teamId).toBe('T001');
      expect(event.metadata.webhookId).toBe('Evt_NoEvent');
      expect(event.correlationId).toBe('Evt_NoEvent');
    });
  });

  describe('normalizePayload - no event_time', () => {
    it('should handle payload without event_time', async () => {
      const body = {
        type: 'event_callback',
        team_id: 'T001',
        event_id: 'Evt_NoTime',
        event: {
          type: 'message',
          channel: 'C001',
          user: 'U001',
          text: 'no time',
          event_ts: '1700000000.000001',
        },
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('slack.message');
      expect(typeof event.timestamp).toBe('string');
    });
  });

  describe('normalizePayload - unknown event type without type field', () => {
    it('should handle payload with no event type and no top-level type', async () => {
      const body = {
        team_id: 'T001',
        event_id: 'Evt_NoType',
        event_time: Math.floor(Date.now() / 1000),
        event: {},
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('slack.unknown');
      expect(event.data.teamId).toBe('T001');
    });
  });

  describe('normalizePayload - null event', () => {
    it('should handle payload with null event object', async () => {
      const body = {
        type: 'event_callback',
        team_id: 'T001',
        event_id: 'Evt_Null',
        event_time: Math.floor(Date.now() / 1000),
        event: null,
      };
      const req = createReq(body);
      const event = await source.normalizePayload(req);
      expect(event.type).toBe('slack.event_callback');
      expect(event.data.teamId).toBe('T001');
      expect(event.metadata.webhookId).toBe('Evt_Null');
    });
  });

  describe('getEventType', () => {
    it('should extract event type from payload', () => {
      const req = createReq({
        type: 'event_callback',
        event: { type: 'message' },
      });
      expect(source.getEventType(req)).toBe('slack.message');
    });

    it('should fall back to top-level type when no nested event', () => {
      const req = createReq({ type: 'url_verification' });
      expect(source.getEventType(req)).toBe('slack.url_verification');
    });
  });

  describe('getWebhookId', () => {
    it('should return event_id from nested event', () => {
      const req = createReq({
        type: 'event_callback',
        event: { type: 'message', event_id: 'Evt_001' },
      });
      expect(source.getWebhookId(req)).toBe('Evt_001');
    });

    it('should fall back to top-level event_id', () => {
      const req = createReq({
        type: 'event_callback',
        event_id: 'Evt_002',
        event: { type: 'message' },
      });
      expect(source.getWebhookId(req)).toBe('Evt_002');
    });

    it('should return undefined when no event_id present', () => {
      const req = createReq({ type: 'event_callback', event: { type: 'message' } });
      expect(source.getWebhookId(req)).toBeUndefined();
    });
  });
});
