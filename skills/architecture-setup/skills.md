# Skill: Architecture Setup

## Description

This skill handles project initialization, dependency management, and core architecture setup for webhook-relay-mcp. It establishes the foundation for a production-ready TypeScript MCP server.

## Capabilities

- Initialize pnpm workspace with TypeScript configuration
- Set up Biome for linting and formatting
- Configure Vitest for unit and integration testing
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
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "typecheck": "tsc --noEmit"
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
pnpm add -D @biomejs/biome
pnpm add -D tsup tsx
```

### 5. Configure Biome (Linting + Formatting)

Create `biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "error",
        "useImportType": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5"
    }
  }
}
```

Add scripts to `package.json`:
```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "format:check": "biome format ."
  }
}
```

### 6. Configure Vitest

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
```

### 7. Create GitHub Actions CI

Create `.github/workflows/ci.yml` with separate jobs for install, audit, lint, typecheck, build, test, coverage, and docker-build. See the project's actual `ci.yml` for the full multi-job reference.

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
