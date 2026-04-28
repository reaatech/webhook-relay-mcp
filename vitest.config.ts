import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'tests',
        'src/types/**',
        'src/webhooks/types.ts',
        'src/index.ts',
        'src/mcp/index.ts',
        'eslint.config.js',
        'vitest.config.ts',
      ],
      thresholds: {
        global: {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
      },
    },
    setupFiles: ['./tests/setup.ts'],
    mockReset: true,
    clearMocks: true,
  },
});
