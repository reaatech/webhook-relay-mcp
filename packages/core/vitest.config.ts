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
    },
  },
  resolve: {
    alias: {
      '@reaatech/webhook-relay-core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
