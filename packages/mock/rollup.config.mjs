import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { mkdirSync, writeFileSync } from 'fs';

const extensions = ['.ts'];

const globals = {
  '@medplum/core': 'medplum.core',
  'fast-json-patch': 'fast-json-patch',
};

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/esm/index.js',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/esm/index.min.js',
      format: 'esm',
      plugins: [terser()],
      sourcemap: true,
    },
    {
      file: 'dist/cjs/index.js',
      format: 'umd',
      name: 'medplum.mock',
      sourcemap: true,
      globals,
    },
    {
      file: 'dist/cjs/index.min.js',
      format: 'umd',
      name: 'medplum.mock',
      plugins: [terser()],
      sourcemap: true,
      globals,
    },
  ],
  plugins: [
    resolve({ extensions }),
    typescript(),
    json(),
    {
      buildEnd: () => {
        mkdirSync('./dist/cjs', { recursive: true });
        mkdirSync('./dist/esm', { recursive: true });
        writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
        writeFileSync('./dist/esm/package.json', '{"type": "module"}');
      },
    },
  ],
  external: Object.keys(globals),
};
