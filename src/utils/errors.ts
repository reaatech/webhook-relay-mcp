export class WebhookRelayError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SignatureVerificationError extends WebhookRelayError {
  constructor(message = 'Signature verification failed') {
    super(message, 'SIGNATURE_VERIFICATION_FAILED');
  }
}

export class ValidationError extends WebhookRelayError {
  constructor(message = 'Validation failed') {
    super(message, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends WebhookRelayError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND');
  }
}

export class ConflictError extends WebhookRelayError {
  constructor(message = 'Conflict detected') {
    super(message, 'CONFLICT');
  }
}
