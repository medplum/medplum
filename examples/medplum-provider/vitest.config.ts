import { defineConfig } from 'vitest/config';
import { existsSync } from 'fs';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@medplum/core': path.resolve(__dirname, '../../packages/core/src'),
      '@medplum/mock': path.resolve(__dirname, '../../packages/mock/src'),
      '@medplum/react': path.resolve(__dirname, '../../packages/react/src'),
      '@medplum/fhirtypes': path.resolve(__dirname, '../../packages/fhirtypes/dist'),
    },
  },
});
