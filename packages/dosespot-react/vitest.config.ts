import { defineConfig as defineVitestConfig } from 'vitest/config';

const vitestConfig = defineVitestConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
  },
});

export default vitestConfig;
