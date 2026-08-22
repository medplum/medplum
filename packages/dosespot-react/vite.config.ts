import { defineConfig } from 'vitest/config';
import { globalSetupFiles, medplumAliases } from '../../vitest.config';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/dosespot-react',
    globals: true,
    environment: 'jsdom',
    setupFiles: [...globalSetupFiles, './src/test.setup.ts'],
    pool: 'threads',
  },
});
