import { mkdirSync, writeFileSync } from 'fs';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'medplum-cli',
      fileName: (format) => `${format}/medplum-cli.js`,
    },
    rollupOptions: {
      external: ['@medplum/core'],
      output: {
        globals: {
          '@medplum/core': 'medplum.core',
        },
      },
    },
  },
  plugins: [
    {
      buildEnd: () => {
        mkdirSync('./dist/cjs', { recursive: true });
        mkdirSync('./dist/esm', { recursive: true });
        writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
        writeFileSync('./dist/esm/package.json', '{"type": "module"}');
      },
    },
  ],
  test: {
    globals: true,
    coverage: {
      reporter: ['text', 'json'],
    },
  },
});
