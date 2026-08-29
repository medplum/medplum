import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config.ts';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/dosespot-react',
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    pool: 'threads',
  },
});
