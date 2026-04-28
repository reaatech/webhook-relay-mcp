import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { StripeSignatureValidator } from '../../../src/webhooks/validators/base.js';

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

  it('should reject an invalid signature', async () => {
    const payload = Buffer.from('{}');
    const signature = 't=123,v1=invalid';

    await expect(validator.validate(payload, signature, secret)).rejects.toThrow();
  });

  it('should reject a signature with missing timestamp', async () => {
    const payload = Buffer.from('{}');
    const signature = 'v1=abc123';

    await expect(validator.validate(payload, signature, secret)).rejects.toThrow(
      'Invalid Stripe signature format'
    );
  });
});
