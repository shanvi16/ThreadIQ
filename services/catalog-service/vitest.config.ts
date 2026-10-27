import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '100000' },
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000, // first run may download the MongoDB binary used by mongodb-memory-server
    fileParallelism: false,
  },
});
