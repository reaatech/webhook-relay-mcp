# Skill: Security Hardening

## Description

This skill covers security-critical features for webhook-relay-mcp: secret encryption at rest, signature validation hardening, input sanitization, and secure configuration patterns.

## Capabilities

- Implement AES-256-GCM secret encryption/decryption
- Harden signature validators against timing attacks
- Add Zod input validation for all MCP tools and HTTP endpoints
- Enforce payload size limits and IP filtering
- Secure configuration management (no secrets in logs/responses)

## Required Context

- **Project**: webhook-relay-mcp
- **Dependencies**: crypto (built-in), zod
- **Environment**: `ENCRYPTION_KEY` must be a 32-byte key from secure source

## Implementation Steps

### 1. Secret Encryption Service

Create `src/utils/crypto.ts`:
```typescript
import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, config.encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store as: iv:authTag:encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedBuffer = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, config.encryptionKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  return decrypted.toString('utf-8');
}
```

### 2. Input Validation Schemas

Create `src/utils/validation.ts`:
```typescript
import { z } from 'zod';

export const subscribeSchema = z.object({
  eventTypes: z.array(z.string().min(1)).min(1),
  filters: z.record(z.unknown()).optional(),
  ttl: z.number().int().min(1).max(86400).optional().default(3600),
});

export const pollSchema = z.object({
  subscriptionId: z.string().min(1),
  eventTypes: z.array(z.string()).optional(),
  timeout: z.number().int().min(0).max(120).optional().default(30),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export const historySchema = z.object({
  eventTypes: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  correlationId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export const registerSourceSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  sourceType: z.enum(['stripe', 'github', 'replicate', 'twilio', 'generic']),
  signingSecret: z.string().min(8),
  webhookUrl: z.string().url().optional(),
});
```

### 3. Payload Size Limits

Add to `src/server.ts`:
```typescript
app.use('/webhooks/*', express.json({ limit: '1mb' }));
app.use('/api/*', express.json({ limit: '100kb' }));
```

## Best Practices

1. Never log secrets or raw signing keys
2. Use constant-time comparison for all signature verification
3. Validate all inputs at the edge (Zod schemas)
4. Encrypt secrets before storing in SQLite
5. Use 32-byte random keys for encryption (not passwords)
6. Rotate encryption keys periodically (manual process for now)

## Related Skills

- **architecture-setup**: For project structure and dependency setup
- **webhook-integration**: For signature validator implementations
- **testing-strategy**: For security test cases

## Dependencies

This skill requires:
- Architecture setup (project structure)
- Database design (source storage)

It enables:
- Production-safe secret handling
- Secure webhook ingestion
