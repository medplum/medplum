import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '50%',
    globals: true,
  },
});
