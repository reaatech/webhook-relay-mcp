import crypto from 'crypto';

export interface SignatureValidator {
  validate(payload: Buffer, signature: string, secret: string): Promise<boolean>;
}

function safeTimingEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export class HMACSignatureValidator implements SignatureValidator {
  constructor(
    private algorithm: 'sha256' | 'sha1' = 'sha256',
    private prefix: string = ''
  ) {}

  async validate(payload: Buffer, signature: string, secret: string): Promise<boolean> {
    const expectedSignature = this.computeSignature(payload, secret);

    const cleanSignature = signature.replace(`${this.prefix}=`, '');

    return safeTimingEqual(
      Buffer.from(cleanSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  private computeSignature(payload: Buffer, secret: string): string {
    return crypto.createHmac(this.algorithm, secret).update(payload).digest('hex');
  }
}

export class StripeSignatureValidator implements SignatureValidator {
  private readonly tolerance = 300; // 5 minutes

  async validate(payload: Buffer, signature: string, secret: string): Promise<boolean> {
    const parts = signature.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const signaturePart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      throw new Error('Invalid Stripe signature format');
    }

    const timestamp = parseInt(timestampPart.substring(2), 10);
    const signedPayload = `${timestamp}.${payload.toString()}`;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > this.tolerance) {
      throw new Error('Webhook signature timestamp outside tolerance');
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    const providedSignature = signaturePart.substring(3);

    return safeTimingEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }
}

export class GitHubSignatureValidator implements SignatureValidator {
  async validate(payload: Buffer, signature: string, secret: string): Promise<boolean> {
    const hmac = crypto.createHmac('sha256', secret);
    const expectedSignature = `sha256=${hmac.update(payload).digest('hex')}`;

    return safeTimingEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }
}
