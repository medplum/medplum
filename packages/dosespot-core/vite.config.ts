import { defineConfig } from 'vitest/config';
import { medplumAliases } from '../../vitest.config.ts';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  test: {
    name: '@medplum/dosespot-core',
    globals: true,
    pool: 'threads',
  },
});
