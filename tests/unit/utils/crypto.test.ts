import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../../../src/utils/crypto.js';

describe('crypto utility', () => {
  describe('encryptSecret', () => {
    it('should generate a valid encrypted format with three colon-separated parts', () => {
      const encrypted = encryptSecret('my-secret-value');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      const [ivStr, authTagStr, ciphertextStr] = parts as [string, string, string];

      const iv = Buffer.from(ivStr, 'base64');
      expect(iv).toHaveLength(12);

      const authTag = Buffer.from(authTagStr, 'base64');
      expect(authTag).toHaveLength(16);

      const ciphertext = Buffer.from(ciphertextStr, 'base64');
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const enc1 = encryptSecret('same-secret');
      const enc2 = encryptSecret('same-secret');
      expect(enc1).not.toBe(enc2);
    });

    it('should handle empty string', () => {
      const encrypted = encryptSecret('');
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });

    it('should handle long strings', () => {
      const longSecret = 'a'.repeat(1000);
      const encrypted = encryptSecret(longSecret);
      expect(encrypted.split(':')).toHaveLength(3);
    });
  });

  describe('decryptSecret', () => {
    it('should successfully decrypt a value encrypted with encryptSecret', () => {
      const original = 'my-webhook-signing-key';
      const encrypted = encryptSecret(original);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should handle special characters in secret', () => {
      const original = 'whsec_!@#$%^&*()_+-=[]{}|;:,.<>?/';
      const encrypted = encryptSecret(original);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should handle unicode characters in secret', () => {
      const original = 'secret-with-unicode-🔐-key';
      const encrypted = encryptSecret(original);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should throw on invalid format (not three parts)', () => {
      expect(() => decryptSecret('not-encrypted')).toThrow(
        'Decryption failed: value is not in encrypted format'
      );
    });

    it('should throw when IV length is wrong', () => {
      const badIv = Buffer.alloc(16).toString('base64');
      const authTag = Buffer.alloc(16).toString('base64');
      const ciphertext = Buffer.alloc(16).toString('base64');
      expect(() => decryptSecret(`${badIv}:${authTag}:${ciphertext}`)).toThrow(
        'Invalid encryption IV length'
      );
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encryptSecret('my-secret');
      const parts = encrypted.split(':');
      const tamperedCiphertext = Buffer.alloc(16).toString('base64');
      expect(() => decryptSecret(`${parts[0]}:${parts[1]}:${tamperedCiphertext}`)).toThrow();
    });

    it('should throw when decrypting with non-b64 parts', () => {
      const encrypted = encryptSecret('my-secret');
      const parts = encrypted.split(':');
      expect(() => decryptSecret(`${parts[0]}:!!!:${parts[2]}`)).toThrow();
    });
  });
});
