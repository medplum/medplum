import { defineConfig as defineVitestConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config';

const vitestConfig = defineVitestConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
  },
});

export default vitestConfig;
