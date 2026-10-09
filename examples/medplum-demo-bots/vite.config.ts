import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '75%',
    globals: true,
  },
});
