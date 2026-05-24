import { ulid } from 'ulid';
import type { NormalizedWebhookEvent, WebhookRequest, WebhookSource } from '../types.js';
import { HMACSignatureValidator } from '../validators/base.js';

interface VercelWebhookPayload {
  id: string;
  type: string;
  createdAt: number;
  payload: {
    deployment?: {
      id: string;
      name?: string;
      url?: string;
      state?: string;
      target?: string;
      [key: string]: unknown;
    };
    project?: {
      id: string;
      name?: string;
      [key: string]: unknown;
    };
    domain?: {
      id: string;
      name?: string;
      [key: string]: unknown;
    };
    team?: {
      id: string;
      name?: string;
      slug?: string;
    };
    user?: {
      id: string;
      username?: string;
      email?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const VERCEL_TYPE_MAP: Record<string, string> = {
  'deployment.created': 'deployment.created',
  'deployment.succeeded': 'deployment.succeeded',
  'deployment.ready': 'deployment.ready',
  'deployment.error': 'deployment.error',
  'deployment.canceled': 'deployment.canceled',
  'deployment.promoted': 'deployment.promoted',
  'project.created': 'project.created',
  'project.removed': 'project.removed',
  'domain.created': 'domain.created',
};

export class VercelWebhookSource implements WebhookSource {
  readonly name = 'vercel';
  readonly displayName = 'Vercel';
  private readonly validator = new HMACSignatureValidator('sha1');

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['x-vercel-signature'] as string;
    if (!signature) {
      throw new Error('Missing x-vercel-signature header');
    }
    return this.validator.validate(req.rawBody as Buffer, signature, secret);
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const payload = req.body as VercelWebhookPayload;
    const sourceType = payload.type;
    const normalizedType = VERCEL_TYPE_MAP[sourceType] ?? `vercel.${sourceType}`;
    const timestamp = new Date(payload.createdAt).toISOString();
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: this.extractCorrelationId(payload),
      data: this.extractEventData(payload),
      rawPayload: payload,
      metadata: {
        webhookId:
          (req.headers['x-vercel-id'] as string) ?? payload.payload.deployment?.id ?? payload.id,
        vercelId: payload.id,
        teamId: payload.payload.team?.id,
        deploymentUrl: payload.payload.deployment?.url,
        projectName: payload.payload.project?.name,
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const payload = req.body as VercelWebhookPayload;
    return VERCEL_TYPE_MAP[payload.type] ?? `vercel.${payload.type}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    return (
      (req.headers['x-vercel-id'] as string) ??
      (req.body as VercelWebhookPayload).payload.deployment?.id
    );
  }

  private extractEventData(payload: VercelWebhookPayload): Record<string, unknown> {
    const data: Record<string, unknown> = {
      vercelEventType: payload.type,
      vercelEventId: payload.id,
    };

    switch (payload.type) {
      case 'deployment.created':
      case 'deployment.succeeded':
      case 'deployment.ready':
      case 'deployment.error':
      case 'deployment.canceled':
      case 'deployment.promoted':
        data.deploymentId = payload.payload.deployment?.id;
        data.deploymentName = payload.payload.deployment?.name;
        data.deploymentUrl = payload.payload.deployment?.url;
        data.deploymentState = payload.payload.deployment?.state;
        data.deploymentTarget = payload.payload.deployment?.target;
        data.projectId = payload.payload.project?.id;
        data.projectName = payload.payload.project?.name;
        data.teamId = payload.payload.team?.id;
        break;

      case 'project.created':
      case 'project.removed':
        data.projectId = payload.payload.project?.id;
        data.projectName = payload.payload.project?.name;
        data.teamId = payload.payload.team?.id;
        break;

      case 'domain.created':
        data.domainId = payload.payload.domain?.id;
        data.domainName = payload.payload.domain?.name;
        data.projectId = payload.payload.project?.id;
        data.teamId = payload.payload.team?.id;
        break;

      default:
        data.deploymentId = payload.payload.deployment?.id;
        data.projectId = payload.payload.project?.id;
        data.domainId = payload.payload.domain?.id;
    }

    return data;
  }

  private extractCorrelationId(payload: VercelWebhookPayload): string | undefined {
    return (
      payload.payload.deployment?.id ?? payload.payload.project?.id ?? payload.payload.domain?.id
    );
  }
}
