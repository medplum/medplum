import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config.ts';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/health-gorilla-core',
    globals: true,
    pool: 'threads',
  },
});
