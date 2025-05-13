import { defineConfig } from 'vitest/config';
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
      '@medplum/fhir-router': path.resolve(__dirname, '../../packages/fhir-router/src'),
      '@medplum/definitions': path.resolve(__dirname, '../../packages/definitions/src'),
      '@medplum/react-hooks': path.resolve(__dirname, '../../packages/react-hooks/src'),
    },
  },
});
