import { ulid } from 'ulid';
import type { WebhookSource, NormalizedWebhookEvent, WebhookRequest } from '../types.js';
import { GitHubSignatureValidator } from '../validators/base.js';

interface GitHubWebhookPayload {
  action: string;
  [key: string]: unknown;
}

const GITHUB_TYPE_MAP: Record<string, string> = {
  push: 'code.push',
  'pull_request.opened': 'code.pull_request.opened',
  'pull_request.closed': 'code.pull_request.closed',
  'pull_request.merged': 'code.pull_request.merged',
  'workflow_run.completed': 'ci.workflow.completed',
  'workflow_run.requested': 'ci.workflow.started',
  'check_run.completed': 'ci.check_run.completed',
  'release.published': 'release.published',
  'release.created': 'release.created',
  'issues.opened': 'issue.opened',
  'issues.closed': 'issue.closed',
  'issue_comment.created': 'issue.comment.created',
  'deployment_status.completed': 'deployment.completed',
  'deployment_status.started': 'deployment.started',
};

export class GitHubWebhookSource implements WebhookSource {
  readonly name = 'github';
  readonly displayName = 'GitHub';
  private readonly validator = new GitHubSignatureValidator();

  async validateSignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      throw new Error('Missing X-Hub-Signature-256 header');
    }
    return this.validator.validate(req.rawBody as Buffer, signature, secret);
  }

  async normalizePayload(req: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const githubEvent = req.headers['x-github-event'] as string;
    const payload = req.body as GitHubWebhookPayload;
    const sourceType = payload.action ? `${githubEvent}.${payload.action}` : githubEvent;
    const normalizedType = GITHUB_TYPE_MAP[sourceType] ?? `github.${sourceType}`;
    const timestamp = (req.headers['x-github-delivery-at'] as string) ?? new Date().toISOString();
    const receivedAt = new Date().toISOString();

    return {
      id: ulid(),
      type: normalizedType,
      source: this.name,
      sourceType,
      timestamp,
      receivedAt,
      correlationId: this.extractCorrelationId(githubEvent, payload),
      data: this.extractEventData(githubEvent, payload),
      rawPayload: payload,
      metadata: {
        webhookId: req.headers['x-github-delivery'] as string,
        repository: (payload.repository as { full_name?: string })?.full_name,
        sender: (payload.sender as { login?: string })?.login,
        installation: (payload.installation as { id?: number })?.id,
      },
    };
  }

  getEventType(req: WebhookRequest): string {
    const githubEvent = req.headers['x-github-event'] as string;
    const payload = req.body as GitHubWebhookPayload;
    const sourceType = payload.action ? `${githubEvent}.${payload.action}` : githubEvent;
    return GITHUB_TYPE_MAP[sourceType] ?? `github.${sourceType}`;
  }

  getWebhookId(req: WebhookRequest): string | undefined {
    return req.headers['x-github-delivery'] as string;
  }

  private extractEventData(event: string, payload: GitHubWebhookPayload): Record<string, unknown> {
    const data: Record<string, unknown> = {
      action: payload.action,
      githubEvent: event,
    };

    switch (event) {
      case 'push':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.ref = payload.ref as string;
        data.before = payload.before as string;
        data.after = payload.after as string;
        data.commitCount = (payload.commits as unknown[] | undefined)?.length ?? 0;
        data.pusher = (payload.pusher as { name?: string })?.name;
        break;

      case 'pull_request':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.number =
          (payload.number as number | undefined) ??
          (payload.pull_request as { number?: number })?.number;
        data.state = (payload.pull_request as { state?: string })?.state;
        data.title = (payload.pull_request as { title?: string })?.title;
        data.branch = (payload.pull_request as { head?: { ref?: string } })?.head?.ref;
        break;

      case 'workflow_run':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.workflowId = (payload.workflow_run as { workflow_id?: number })?.workflow_id;
        data.status = (payload.workflow_run as { status?: string })?.status;
        data.conclusion = (payload.workflow_run as { conclusion?: string })?.conclusion;
        data.branch = (payload.workflow_run as { head_branch?: string })?.head_branch;
        break;

      case 'release':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.tagName = (payload.release as { tag_name?: string })?.tag_name;
        data.releaseName = (payload.release as { name?: string })?.name;
        data.draft = (payload.release as { draft?: boolean })?.draft;
        data.prerelease = (payload.release as { prerelease?: boolean })?.prerelease;
        break;

      case 'deployment_status':
        data.repository = (payload.repository as { full_name?: string })?.full_name;
        data.state = (payload.deployment_status as { state?: string })?.state;
        data.environment = (payload.deployment as { environment?: string })?.environment;
        break;

      default:
        data.repository = (payload.repository as { full_name?: string })?.full_name;
    }

    return data;
  }

  private extractCorrelationId(event: string, payload: GitHubWebhookPayload): string | undefined {
    switch (event) {
      case 'pull_request':
        return String((payload.pull_request as { id?: number })?.id ?? '');
      case 'workflow_run':
        return String((payload.workflow_run as { id?: number })?.id ?? '');
      case 'release':
        return String((payload.release as { id?: number })?.id ?? '');
      default:
        return undefined;
    }
  }
}
