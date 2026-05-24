import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 92,
        statements: 92,
        functions: 88,
        branches: 88,
      },
    },
  },
  resolve: {
    alias: {
      '@reaatech/webhook-relay-core': path.resolve(__dirname, '../core/src/index.ts'),
      '@reaatech/webhook-relay-storage': path.resolve(__dirname, '../storage/src/index.ts'),
      '@reaatech/webhook-relay-webhooks': path.resolve(__dirname, '../webhooks/src/index.ts'),
      '@reaatech/webhook-relay-tools': path.resolve(__dirname, '../mcp/src/index.ts'),
      '@reaatech/webhook-relay-mcp': path.resolve(__dirname, '../server/src/index.ts'),
    },
  },
});
