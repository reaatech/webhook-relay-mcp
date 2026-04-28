# Skill: Deployment Automation

## Description

This skill covers containerization, CI/CD pipeline refinement, and production deployment patterns for webhook-relay-mcp.

## Capabilities

- Create optimized Docker image for Node.js + SQLite
- Configure docker-compose for local development
- Set up GitHub Actions for build, test, and release
- Document environment variable requirements

## Required Context

- **Project**: webhook-relay-mcp
- **Runtime**: Node.js 20.x
- **Database**: SQLite (file-based, needs volume persistence)

## Implementation Steps

### 1. Dockerfile

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache sqlite
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
```

### 2. Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  webhook-relay:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_PATH=/app/data/webhook-relay.db
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - LOG_LEVEL=info
      - WEBHOOK_BASE_URL=${WEBHOOK_BASE_URL}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### 3. CI/CD Pipeline

The `.github/workflows/ci.yml` from `architecture-setup` is the baseline. Enhance with:

```yaml
  release:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build Docker image
        run: docker build -t webhook-relay-mcp:latest .
```

## Environment Variables for Production

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | HTTP server port |
| `DATABASE_PATH` | Yes | SQLite file path (should be on persistent volume) |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for secret encryption |
| `WEBHOOK_BASE_URL` | Yes | Public URL for webhook endpoints |
| `LOG_LEVEL` | No | `info`, `warn`, `error` (default: `info`) |
| `EVENT_RETENTION_DAYS` | No | Event retention period (default: 30) |

## Best Practices

1. Never build with `NODE_ENV=production` during `pnpm install` of dev deps
2. Use multi-stage Docker builds to minimize image size
3. Mount SQLite database directory as a persistent volume
4. Run health checks on `/health` endpoint
5. Use `.dockerignore` to exclude tests, docs, and local data

## Related Skills

- **architecture-setup**: For base CI configuration and package.json
- **database-design**: For SQLite persistence requirements

## Dependencies

This skill requires:
- Architecture setup (project structure, CI baseline)
- All development skills completed (working code to containerize)

It enables:
- Production deployment
- Local development with docker-compose
