# Skill: Testing Strategy

## Description

This skill establishes testing patterns, fixtures, and coverage targets for webhook-relay-mcp. It ensures reliability of signature verification, payload normalization, and MCP tool behavior.

## Capabilities

- Set up Vitest configuration with coverage thresholds
- Create test fixtures for webhook payloads (Stripe, GitHub, Replicate)
- Mock database and external services
- Write unit tests for validators and normalizers
- Write integration tests for end-to-end webhook flow

## Required Context

- **Project**: webhook-relay-mcp
- **Test Runner**: Vitest
- **Coverage Target**: >80% statements, >75% branches

## Implementation Steps

### 1. Test Directory Structure

```
tests/
├── unit/
│   ├── validators/
│   │   ├── stripe.test.ts
│   │   ├── github.test.ts
│   │   └── base.test.ts
│   ├── normalizers/
│   │   ├── stripe.test.ts
│   │   └── github.test.ts
│   └── repositories/
│       ├── events.test.ts
│       └── subscriptions.test.ts
├── integration/
│   ├── webhooks.test.ts
│   └── mcp-tools.test.ts
└── fixtures/
    ├── stripe/
    │   ├── payment-succeeded.json
    │   └── payment-failed.json
    ├── github/
    │   ├── push.json
    │   └── workflow-run.json
    └── replicate/
        └── prediction-completed.json
```

### 2. Database Test Helper

Create `tests/helpers/database.ts`:
```typescript
import Database from 'better-sqlite3';
import { MigrationService } from '../../src/storage/migrations.js';

export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  MigrationService.run(db);
  return db;
}

export function cleanupTestDatabase(db: Database.Database): void {
  db.close();
}
```

### 3. Webhook Fixture Example

Create `tests/fixtures/stripe/payment-succeeded.json`:
```json
{
  "id": "evt_test_123",
  "type": "invoice.payment_succeeded",
  "created": 1700000000,
  "data": {
    "object": {
      "id": "in_test_123",
      "customer": "cus_test_123",
      "amount_due": 5000,
      "currency": "usd"
    }
  }
}
```

### 4. Validator Unit Test Template

Create `tests/unit/validators/stripe.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
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
});
```

## Best Practices

1. Use `:memory:` SQLite databases for unit tests
2. Never use real secrets in tests — use `test_` prefixes
3. Reset database state between tests with `beforeEach`
4. Test both success and failure paths for validators
5. Mock time-sensitive operations (Stripe timestamp tolerance)
6. Keep fixtures realistic but anonymized
7. Target >80% coverage before considering a feature complete

## Related Skills

- **architecture-setup**: For Vitest and CI configuration
- **webhook-integration**: For testing webhook handlers
- **mcp-tools**: For testing MCP tool behavior

## Dependencies

This skill requires:
- Architecture setup (Vitest config, CI pipeline)
- Database design (repository interfaces to test)

It enables:
- Confident refactoring
- Regression prevention
- Production reliability
