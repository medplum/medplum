import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    maxWorkers: process.env.TEST_MAX_WORKERS ?? '50%',
    globals: true,
  },
});
