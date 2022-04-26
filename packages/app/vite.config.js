import sri from '@small-tech/vite-plugin-sri';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), sri()],
  build: {
    rollupOptions: {
      external: ['@medplum/core', '@medplum/mock', '@medplum/ui', 'react', 'react-dom', 'react-router-dom'],
      output: {
        globals: {
          '@medplum/core': 'medplum.core',
          '@medplum/mock': 'medplum.mock',
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-router-dom': 'ReactRouterDOM',
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    coverage: {
      reporter: ['text', 'json'],
    },
  },
});
