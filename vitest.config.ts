import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'lib/**/*.test.ts', 'components/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/signing/**/*.ts', 'lib/history.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
