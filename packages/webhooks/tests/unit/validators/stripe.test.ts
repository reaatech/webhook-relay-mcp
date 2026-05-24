import crypto from 'node:crypto';
import { StripeSignatureValidator } from '@reaatech/webhook-relay-webhooks';
import { describe, expect, it } from 'vitest';

describe('StripeSignatureValidator', () => {
  const validator = new StripeSignatureValidator();
  const secret = 'whsec_test_secret';

  it('should validate a correct signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ id: 'evt_123' }));
    const signedPayload = `${timestamp}.${payload.toString()}`;
    const signature = `t=${timestamp},v1=${crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')}`;

    const result = await validator.validate(payload, signature, secret);
    expect(result).toBe(true);
  });

  it('should return false for a wrong signature with a fresh timestamp', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ id: 'evt_123' }));
    const wrongSig = crypto.createHmac('sha256', 'wrong_secret').update('x').digest('hex');
    const signature = `t=${timestamp},v1=${wrongSig}`;

    const result = await validator.validate(payload, signature, secret);
    expect(result).toBe(false);
  });

  it('should reject an expired timestamp (replay protection)', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const payload = Buffer.from(JSON.stringify({ id: 'evt_123' }));
    const signedPayload = `${oldTimestamp}.${payload.toString()}`;
    const signature = `t=${oldTimestamp},v1=${crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')}`;

    await expect(validator.validate(payload, signature, secret)).rejects.toThrow(
      'Webhook signature timestamp outside tolerance',
    );
  });

  it('should accept a timestamp within tolerance', async () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 120;
    const payload = Buffer.from(JSON.stringify({ id: 'evt_123' }));
    const signedPayload = `${recentTimestamp}.${payload.toString()}`;
    const signature = `t=${recentTimestamp},v1=${crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')}`;

    const result = await validator.validate(payload, signature, secret);
    expect(result).toBe(true);
  });

  it('should reject a signature with missing timestamp', async () => {
    const payload = Buffer.from('{}');
    const signature = 'v1=abc123';

    await expect(validator.validate(payload, signature, secret)).rejects.toThrow(
      'Invalid Stripe signature format',
    );
  });
});
