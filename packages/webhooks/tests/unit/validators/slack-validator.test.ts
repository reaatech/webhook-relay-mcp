import crypto from 'node:crypto';
import { SlackSignatureValidator } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';

describe('SlackSignatureValidator', () => {
  const validator = new SlackSignatureValidator();
  const secret = 'slack_validator_secret';

  describe('validate', () => {
    it('should validate a valid v0 signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = Buffer.from(
        JSON.stringify({ type: 'event_callback', event: { type: 'message' } }),
      );
      const baseString = `v0:${timestamp}:${payload.toString()}`;
      const signature = `v0=${crypto.createHmac('sha256', secret).update(baseString).digest('hex')}`;

      const result = await validator.validate(payload, signature, secret, timestamp);
      expect(result).toBe(true);
    });

    it('should reject an invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = Buffer.from(JSON.stringify({}));
      const signature = 'v0=0000000000000000000000000000000000000000000000000000000000000000';

      const result = await validator.validate(payload, signature, secret, timestamp);
      expect(result).toBe(false);
    });

    it('should throw when no timestamp is provided', async () => {
      const payload = Buffer.from('{}');
      await expect(validator.validate(payload, 'v0=abc', secret)).rejects.toThrow(
        'Missing X-Slack-Request-Timestamp header',
      );
    });

    it('should throw when signature does not start with v0=', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = Buffer.from('{}');
      await expect(validator.validate(payload, 'invalid', secret, timestamp)).rejects.toThrow(
        'Invalid Slack signature format',
      );
    });

    it('should reject an expired timestamp', async () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const payload = Buffer.from(JSON.stringify({}));
      const baseString = `v0:${oldTimestamp}:${payload.toString()}`;
      const signature = `v0=${crypto.createHmac('sha256', secret).update(baseString).digest('hex')}`;

      await expect(validator.validate(payload, signature, secret, oldTimestamp)).rejects.toThrow(
        'Webhook signature timestamp outside tolerance',
      );
    });

    it('should accept a timestamp within tolerance', async () => {
      const recentTimestamp = (Math.floor(Date.now() / 1000) - 120).toString();
      const payload = Buffer.from(JSON.stringify({ test: true }));
      const baseString = `v0:${recentTimestamp}:${payload.toString()}`;
      const signature = `v0=${crypto.createHmac('sha256', secret).update(baseString).digest('hex')}`;

      const result = await validator.validate(payload, signature, secret, recentTimestamp);
      expect(result).toBe(true);
    });
  });
});
