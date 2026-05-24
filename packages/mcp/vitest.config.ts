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
        lines: 90,
        statements: 90,
        functions: 92,
        branches: 77,
      },
    },
  },
  resolve: {
    alias: {
      '@reaatech/webhook-relay-core': path.resolve(__dirname, '../core/src/index.ts'),
      '@reaatech/webhook-relay-storage': path.resolve(__dirname, '../storage/src/index.ts'),
      '@reaatech/webhook-relay-mcp': path.resolve(__dirname, '../mcp/src/index.ts'),
    },
  },
});
