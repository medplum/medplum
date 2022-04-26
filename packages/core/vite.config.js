import { writeFileSync } from 'fs';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'medplum-core',
      fileName: (format) => `${format}/medplum-core.js`,
    },
  },
  plugins: [
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
    coverage: {
      reporter: ['text', 'json'],
    },
  },
});
