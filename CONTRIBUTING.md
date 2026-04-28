# Contributing to webhook-relay-mcp

Thank you for your interest in contributing to **webhook-relay-mcp**! This document provides guidelines and instructions for contributing to the project.

## Getting Started

### Prerequisites

- **Node.js** >= 20.x (LTS recommended)
- **pnpm** >= 8.x
- **Git** for version control

### Setting Up Development Environment

1. **Fork the repository** on GitHub (github.com/reaatech/webhook-relay-mcp)

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/reaatech/webhook-relay-mcp.git
   cd webhook-relay-mcp
   ```

3. **Install dependencies**:
   ```bash
   pnpm install
   ```

4. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

5. **Verify setup**:
   ```bash
   pnpm build
   pnpm test
   pnpm lint
   ```

## Development Workflow

### Branch Strategy

- **main**: Production-ready code
- **feature/**: New features (e.g., `feature/stripe-webhook-handler`)
- **fix/**: Bug fixes (e.g., `fix/signature-validation`)
- **docs/**: Documentation updates
- **refactor/**: Code refactoring without functional changes

### Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear, semantic commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat(webhooks): add GitHub signature validation"
git commit -m "fix(database): resolve connection pooling issue"
git commit -m "docs: update API documentation"
```

### Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Run tests and linting**:
   ```bash
   pnpm test
   pnpm lint
   pnpm format
   pnpm typecheck
   ```

4. **Commit your changes** with semantic commits

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** on GitHub:
   - Use the PR template provided
   - Link any related issues
   - Provide clear description of changes
   - Include test coverage information

7. **Code Review**:
   - All PRs require at least one approval
   - Address review feedback promptly
   - Ensure CI passes before merging

8. **Merge**: Maintainers will merge when ready

## Coding Standards

### TypeScript

- Use strict mode (`"strict": true` in tsconfig.json)
- Prefer interfaces over types for object shapes
- Use explicit return types for functions
- Avoid `any` - use proper typing or `unknown`
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Code Organization

```typescript
// 1. Imports (grouped and sorted)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';

// 2. Constants
const PORT = 3000;

// 3. Interfaces/Types
interface Config {
  port: number;
}

// 4. Classes/Functions
export class WebhookServer {
  // Implementation
}

// 5. Exports
export default WebhookServer;
```

### Error Handling

- Use custom error classes for domain errors
- Always include context in error logs
- Never expose internal errors to API consumers
- Use try-catch blocks appropriately

```typescript
// Good
throw new SignatureVerificationError('Invalid Stripe signature', {
  source: 'stripe',
  webhookId: 'wh_123'
});

// Bad
throw new Error('Signature invalid');
```

### Testing

- Write tests for all new features
- Maintain >80% code coverage
- Use descriptive test names
- Test both success and failure paths

```typescript
describe('StripeWebhookSource', () => {
  describe('validateSignature', () => {
    it('should accept valid Stripe signatures', async () => {
      // Test implementation
    });

    it('should reject invalid signatures', async () => {
      // Test implementation
    });
  });
});
```

## Adding New Webhook Sources

When adding support for a new webhook provider:

1. **Create source handler** in `src/webhooks/sources/<provider>.ts`:
   ```typescript
   export class NewProviderWebhookSource implements WebhookSource {
     readonly name = 'newprovider';
     readonly displayName = 'New Provider';
     
     async validateSignature(req: Request, secret: string): Promise<boolean>;
     async normalizePayload(req: Request): Promise<NormalizedWebhookEvent>;
     getEventType(req: Request): string;
     getWebhookId(req: Request): string | undefined;
   }
   ```

2. **Add signature validator** if needed in `src/webhooks/validators/`

3. **Register the source** in `src/webhooks/sources/index.ts`

4. **Write comprehensive tests** in `tests/webhooks/sources/`

5. **Update documentation** with setup instructions

## Adding MCP Tools

When adding new MCP tools:

1. **Define the tool** in `src/mcp/tools/<tool-name>.ts`:
   ```typescript
   export const myTool = defineTool(
     'webhooks.mytool',
     'Description of what the tool does',
     {
       type: 'object',
       properties: {
         param1: { type: 'string', description: '...' }
       },
       required: ['param1']
     },
     async (args) => {
       // Implementation
       return { content: [...] };
     }
   );
   ```

2. **Register the tool** in `src/mcp/tools/index.ts`

3. **Write tests** in `tests/mcp/tools/`

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for architectural changes
- Add inline comments for complex logic
- Update API documentation for endpoint changes
- Include examples in docstrings

## Security Considerations

- **Never commit secrets** or API keys
- **Validate all inputs** using Zod schemas
- **Use parameterized queries** to prevent SQL injection
- **Implement proper signature verification** for webhooks
- **Encrypt sensitive data** at rest
- **Follow OWASP guidelines** for web security

## Reporting Issues

### Bug Reports

1. **Search existing issues** first
2. **Use the bug report template**
3. **Include**:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS)
   - Relevant logs or error messages

### Feature Requests

1. **Search existing requests** first
2. **Use the feature request template**
3. **Include**:
   - Clear problem statement
   - Proposed solution
   - Use cases and examples
   - Alternatives considered

## Questions?

- **General questions**: Open a GitHub Discussion
- **Bug reports**: Use GitHub Issues
- **Security issues**: Email security@reaatech.dev (do not open public issue)

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive experience for everyone.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

**Thank you for contributing to webhook-relay-mcp!** 🚀

For more information, see:
- [DEV_PLAN.md](DEV_PLAN.md) - Development roadmap
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [AGENTS.md](AGENTS.md) - Agent skills documentation
