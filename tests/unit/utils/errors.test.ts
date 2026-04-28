import { describe, it, expect } from 'vitest';
import {
  WebhookRelayError,
  SignatureVerificationError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../../src/utils/errors.js';

describe('Error classes', () => {
  it('WebhookRelayError should have message and code', () => {
    const err = new WebhookRelayError('Something failed', 'TEST_ERROR');
    expect(err.message).toBe('Something failed');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.name).toBe('WebhookRelayError');
  });

  it('SignatureVerificationError should have default message', () => {
    const err = new SignatureVerificationError();
    expect(err.message).toBe('Signature verification failed');
    expect(err.code).toBe('SIGNATURE_VERIFICATION_FAILED');
    expect(err.name).toBe('SignatureVerificationError');
  });

  it('SignatureVerificationError should accept custom message', () => {
    const err = new SignatureVerificationError('Custom sig error');
    expect(err.message).toBe('Custom sig error');
  });

  it('ValidationError should have default message', () => {
    const err = new ValidationError();
    expect(err.message).toBe('Validation failed');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
  });

  it('NotFoundError should format message with resource', () => {
    const err = new NotFoundError('Subscription');
    expect(err.message).toBe('Subscription not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
  });

  it('ConflictError should have default message', () => {
    const err = new ConflictError();
    expect(err.message).toBe('Conflict detected');
    expect(err.code).toBe('CONFLICT');
    expect(err.name).toBe('ConflictError');
  });

  it('ConflictError should accept custom message', () => {
    const err = new ConflictError('Already exists');
    expect(err.message).toBe('Already exists');
  });
});
