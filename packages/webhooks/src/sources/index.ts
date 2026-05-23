import type { WebhookSource } from '../types.js';
import { GenericWebhookSource } from './generic.js';
import { GitHubWebhookSource } from './github.js';
import { ReplicateWebhookSource } from './replicate.js';
import { StripeWebhookSource } from './stripe.js';
import { TwilioWebhookSource } from './twilio.js';

export const webhookSources: Record<string, new () => WebhookSource> = {
  stripe: StripeWebhookSource,
  github: GitHubWebhookSource,
  replicate: ReplicateWebhookSource,
  twilio: TwilioWebhookSource,
  generic: GenericWebhookSource,
};

export function getWebhookSource(sourceType: string): WebhookSource | undefined {
  const SourceClass = webhookSources[sourceType];
  return SourceClass ? new SourceClass() : undefined;
}

export function registerWebhookSource(name: string, source: new () => WebhookSource): void {
  webhookSources[name] = source;
}

export { StripeWebhookSource } from './stripe.js';
export { GitHubWebhookSource } from './github.js';
export { ReplicateWebhookSource } from './replicate.js';
export { TwilioWebhookSource } from './twilio.js';
export { GenericWebhookSource } from './generic.js';
