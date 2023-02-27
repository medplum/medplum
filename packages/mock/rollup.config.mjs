import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { mkdirSync, writeFileSync } from 'fs';

const extensions = ['.ts'];

const globals = {
  '@medplum/core': 'medplum.core',
  '@medplum/fhir-router': 'medplum.fhirRouter',
  'rfc6902': 'rfc6902',
};

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/esm/index.mjs',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/esm/index.min.mjs',
      format: 'esm',
      plugins: [terser()],
      sourcemap: true,
    },
    {
      file: 'dist/cjs/index.cjs',
      format: 'umd',
      name: 'medplum.mock',
      sourcemap: true,
      globals,
    },
    {
      file: 'dist/cjs/index.min.cjs',
      format: 'umd',
      name: 'medplum.mock',
      plugins: [terser()],
      sourcemap: true,
      globals,
    },
  ],
  plugins: [
    resolve({ extensions }),
    typescript({ declaration: false }),
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
