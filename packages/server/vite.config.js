import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      reporter: ['text', 'json'],
    },
  },
});
