import { ulid } from 'ulid';
import type { NormalizedWebhookEvent, WebhookRequest, WebhookSource } from '../types.js';
import { SlackSignatureValidator } from '../validators/base.js';

interface SlackEventPayload {
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event?: {
    type: string;
    event_id?: string;
    event_ts?: string;
    [key: string]: unknown;
  };
  event_id?: string;
  event_time?: number;
  type: string;
  challenge?: string;
  [key: string]: unknown;
}

export class SlackWebhookSource implements WebhookSource {
  readonly name = 'slack';
  readonly displayName = 'Slack';
  private readonly validator = new SlackSignatureValidator();

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['x-slack-signature'] as string;
    const timestamp = req.headers['x-slack-request-timestamp'] as string;

    if (!signature) {
      throw new Error('Missing X-Slack-Signature header');
    }
    if (!timestamp) {
      throw new Error('Missing X-Slack-Request-Timestamp header');
    }

    return this.validator.validate(req.rawBody as Buffer, signature, secret, timestamp);
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const payload = req.body as SlackEventPayload;

    if (payload.type === 'url_verification') {
      throw new Error('URL verification challenge received — handle separately');
    }

    const slackEvent = payload.event;
    const sourceType = slackEvent?.type ?? payload.type ?? 'unknown';
    const normalizedType = `slack.${sourceType}`;
    const timestamp = payload.event_time
      ? new Date(payload.event_time * 1000).toISOString()
      : new Date().toISOString();
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: (slackEvent?.channel as string) ?? payload.event_id,
      data: this.extractEventData(payload),
      rawPayload: payload,
      metadata: {
        webhookId: slackEvent?.event_id ?? payload.event_id,
        teamId: payload.team_id,
        apiAppId: payload.api_app_id,
        channel: slackEvent?.channel,
        user: slackEvent?.user,
        eventTs: slackEvent?.event_ts,
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const payload = req.body as SlackEventPayload;
    const sourceType = payload.event?.type ?? payload.type ?? 'unknown';
    return `slack.${sourceType}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    const payload = req.body as SlackEventPayload;
    return payload.event?.event_id ?? payload.event_id;
  }

  private extractEventData(payload: SlackEventPayload): Record<string, unknown> {
    const slackEvent = payload.event;
    const data: Record<string, unknown> = {
      slackEventType: slackEvent?.type ?? payload.type,
      teamId: payload.team_id,
    };

    if (!slackEvent) {
      return data;
    }

    data.channel = slackEvent.channel;
    data.user = slackEvent.user;
    data.eventTs = slackEvent.event_ts;

    switch (slackEvent.type) {
      case 'message':
      case 'app_mention':
        data.text = slackEvent.text as string;
        data.ts = slackEvent.ts as string;
        data.threadTs = slackEvent.thread_ts as string;
        data.blocks = slackEvent.blocks;
        break;

      case 'reaction_added':
      case 'reaction_removed':
        data.reaction = slackEvent.reaction as string;
        data.item = slackEvent.item;
        data.itemUser = slackEvent.item_user as string;
        break;

      case 'channel_created':
        data.channelName = (slackEvent.channel as { name?: string })?.name;
        data.channelId = (slackEvent.channel as { id?: string })?.id;
        break;

      case 'member_joined_channel':
        data.inviter = slackEvent.inviter as string;
        break;

      default:
        break;
    }

    return data;
  }
}
