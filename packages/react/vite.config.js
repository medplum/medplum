import replace from '@rollup/plugin-replace';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { defineConfig } from 'vite';

dotenv.config();

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'medplum-react',
      fileName: (format) => `${format}/medplum-react.js`,
    },
    rollupOptions: {
      external: ['@medplum/core', '@medplum/mock', 'react', 'react-dom', 'react-router-dom'],
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
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        'process.env.NODE_ENV': '"production"',
        'process.env.GOOGLE_AUTH_ORIGINS': `"${process.env.GOOGLE_AUTH_ORIGINS}"`,
        'process.env.GOOGLE_CLIENT_ID': `"${process.env.GOOGLE_CLIENT_ID}"`,
      },
    }),
    react(),
    {
      closeBundle: () => {
        writeFileSync('./dist/umd/package.json', '{"type": "commonjs"}');
        writeFileSync('./dist/es/package.json', '{"type": "module"}');
      },
    },
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    coverage: {
      reporter: ['text', 'json'],
    },
  },
});
