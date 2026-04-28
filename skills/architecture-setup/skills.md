# Skill: Architecture Setup

## Description

This skill handles project initialization, dependency management, and core architecture setup for webhook-relay-mcp. It establishes the foundation for a production-ready TypeScript MCP server.

## Capabilities

- Initialize pnpm workspace with TypeScript configuration
- Set up ESLint, Prettier, and EditorConfig for code quality
- Configure Vitest for unit and integration testing
- Set up Husky pre-commit hooks with lint-staged
- Create GitHub Actions CI/CD pipeline
- Configure package.json with all required dependencies
- Set up directory structure per ARCHITECTURE.md

## Required Context

- **Project Name**: webhook-relay-mcp
- **GitHub User**: reatech
- **Repository**: github.com/reaatech/webhook-relay-mcp
- **Node Version**: 20.x (LTS)
- **Package Manager**: pnpm

## Implementation Steps

### 1. Initialize Project Structure

```bash
# Create project directory and initialize
mkdir -p webhook-relay-mcp && cd webhook-relay-mcp
pnpm init

# Create source directories
mkdir -p src/{types,handlers,webhooks,storage,middleware,utils}
mkdir -p tests/{unit,integration,fixtures}
mkdir -p docs/sources
```

### 2. Configure TypeScript

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 3. Configure Package.json

```json
{
  "name": "@reaatech/webhook-relay-mcp",
  "version": "0.1.0",
  "description": "MCP server for webhook ingestion and event relay",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "webhook-relay-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write src/**/*.ts",
    "format:check": "prettier --check src/**/*.ts",
    "typecheck": "tsc --noEmit",
    "prepare": "husky"
  },
  "keywords": ["mcp", "webhook", "stripe", "github", "replicate"],
  "author": "reaatech",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/reaatech/webhook-relay-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/reaatech/webhook-relay-mcp/issues"
  },
  "homepage": "https://github.com/reaatech/webhook-relay-mcp#readme",
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 4. Install Dependencies

```bash
# Core dependencies
pnpm add @modelcontextprotocol/sdk express better-sqlite3 zod pino uuid ulid raw-body

# Dev dependencies
pnpm add -D typescript @types/node @types/express @types/better-sqlite3 @types/uuid @types/ulid
pnpm add -D vitest @vitest/coverage-v8
pnpm add -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
pnpm add -D prettier
pnpm add -D husky lint-staged
pnpm add -D tsx
```

### 5. Configure ESLint

Create `.eslintrc.json`:
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/strict"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["error", "warn"] }],
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"]
  },
  "ignorePatterns": ["dist", "node_modules", "coverage"]
}
```

### 6. Configure Prettier

Create `.prettierrc`:
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

Create `.prettierignore`:
```
dist
node_modules
coverage
*.md
```

### 7. Configure EditorConfig

Create `.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[*.{json,yml,yaml}]
indent_size = 2

[Makefile]
indent_style = tab
```

### 8. Configure Vitest

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'tests'],
      thresholds: {
        global: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
    setupFiles: [],
    mockReset: true,
    clearMocks: true,
  },
});
```

### 9. Configure Husky & lint-staged

Create `.lintstagedrc.json`:
```json
{
  "*.ts": [
    "eslint --fix",
    "prettier --write"
  ],
  "*.{json,md}": [
    "prettier --write"
  ]
}
```

Initialize Husky:
```bash
pnpm exec husky init
```

Then create `.husky/pre-commit`:
```bash
pnpm exec lint-staged
```

### 10. Create GitHub Actions CI

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x, 22.x]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Lint
        run: pnpm lint
      
      - name: Type check
        run: pnpm typecheck
      
      - name: Format check
        run: pnpm format:check
      
      - name: Test
        run: pnpm test:coverage
      
      - name: Build
        run: pnpm build
```

### 11. Create Environment Configuration

Create `.env.example`:
```bash
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_PATH=./data/webhook-relay.db

# Encryption
ENCRYPTION_KEY=your-32-character-master-key-here

# MCP Server
MCP_TRANSPORT=stdio

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Webhook Base URL (for registration)
WEBHOOK_BASE_URL=https://your-domain.com
```

Create `.gitignore`:
```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build
dist/
build/

# Database
*.db
*.db-journal
data/

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
pnpm-debug.log*

# Testing
coverage/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Temp
tmp/
temp/
*.tmp

# Husky
.husky/*.sh
```

## Examples

### Example: Creating a Basic Entry Point

Create `src/index.ts`:
```typescript
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';

async function main() {
  try {
    logger.info({ event: 'server_starting' }, 'Starting webhook-relay-mcp server');
    
    const server = new Server(
      {
        name: 'webhook-relay-mcp',
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info({ event: 'server_started' }, 'Server running on stdio');
  } catch (error) {
    logger.error({ error, event: 'server_error' }, 'Failed to start server');
    process.exit(1);
  }
}

main();
```

## Best Practices

1. **Type Safety**: Always use strict TypeScript configuration
2. **Code Quality**: Enforce linting and formatting on commit
3. **Testing**: Maintain >80% test coverage
4. **Security**: Never commit secrets, use environment variables
5. **Documentation**: Document all public APIs and complex logic
6. **Error Handling**: Use structured error types with proper logging
7. **Performance**: Profile before optimizing, measure after changes

## Related Skills

- **database-design**: For SQLite schema setup after architecture is ready
- **webhook-integration**: For adding webhook sources once foundation is set
- **security-hardening**: For implementing security features
- **deployment-automation**: For production deployment setup

## Dependencies

This skill should be executed first before other development skills. It provides the foundation for:
- All development work
- CI/CD pipeline
- Code quality enforcement
- Testing infrastructure
