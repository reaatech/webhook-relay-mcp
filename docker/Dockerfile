# Build stage
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm build

# Production stage
FROM node:22-alpine AS production

RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

RUN adduser -D appuser

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/*/package.json ./packages/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages ./packages

RUN mkdir -p /app/data && chown -R appuser:appuser /app/data

USER appuser

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/webhook-relay.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
