import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM

function deriveKey(keyString: string): Buffer {
  return crypto.createHash('sha256').update(keyString).digest();
}

export function encryptSecret(secret: string): string {
  const key = deriveKey(config.encryptionKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(encrypted: string): string {
  const key = deriveKey(config.encryptionKey);
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error(
      'Decryption failed: value is not in encrypted format. ' +
        'Re-encrypt the secret or check ENCRYPTION_KEY.'
    );
  }

  const [ivPart, authTagPart, ciphertextPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64');
  const authTag = Buffer.from(authTagPart, 'base64');
  const ciphertext = Buffer.from(ciphertextPart, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid encryption IV length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
