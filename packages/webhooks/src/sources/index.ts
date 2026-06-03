import type { WebhookSource } from '../types.js';
import { GenericWebhookSource } from './generic.js';
import { GitHubWebhookSource } from './github.js';
import { ReplicateWebhookSource } from './replicate.js';
import { SendGridWebhookSource } from './sendgrid.js';
import { SlackWebhookSource } from './slack.js';
import { StripeWebhookSource } from './stripe.js';
import { TwilioWebhookSource } from './twilio.js';
import { VercelWebhookSource } from './vercel.js';

export const webhookSources: Record<string, new () => WebhookSource> = {
  stripe: StripeWebhookSource,
  github: GitHubWebhookSource,
  replicate: ReplicateWebhookSource,
  sendgrid: SendGridWebhookSource,
  slack: SlackWebhookSource,
  twilio: TwilioWebhookSource,
  vercel: VercelWebhookSource,
  generic: GenericWebhookSource,
};

export function getWebhookSource(sourceType: string): WebhookSource | undefined {
  const SourceClass = webhookSources[sourceType];
  return SourceClass ? new SourceClass() : undefined;
}

export function registerWebhookSource(name: string, source: new () => WebhookSource): void {
  webhookSources[name] = source;
}

export { GenericWebhookSource } from './generic.js';
export { GitHubWebhookSource } from './github.js';
export { ReplicateWebhookSource } from './replicate.js';
export { SendGridWebhookSource } from './sendgrid.js';
export { SlackWebhookSource } from './slack.js';
export { StripeWebhookSource } from './stripe.js';
export { TwilioWebhookSource } from './twilio.js';
export { VercelWebhookSource } from './vercel.js';
