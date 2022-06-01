import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { mkdirSync, writeFileSync } from 'fs';

const extensions = ['.ts'];

export default {
  input: 'src/index.ts',
  output: [
    {
      banner: '#!/usr/bin/env node',
      file: 'dist/esm/index.js',
      format: 'esm',
      sourcemap: true,
    },
    {
      banner: '#!/usr/bin/env node',
      file: 'dist/cjs/index.js',
      format: 'umd',
      name: 'medplum.cli',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve({ extensions }),
    typescript(),
    {
      buildEnd: () => {
        mkdirSync('./dist/cjs', { recursive: true });
        mkdirSync('./dist/esm', { recursive: true });
        writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
        writeFileSync('./dist/esm/package.json', '{"type": "module"}');
      },
    },
  ],
};
