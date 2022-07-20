import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { mkdirSync, writeFileSync } from 'fs';
import { terser } from 'rollup-plugin-terser';

const extensions = ['.ts'];

const globals = {
  pdfmake: 'pdfmake',
  stream: 'stream',
};

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/cjs/index.js',
        format: 'umd',
        name: 'medplum.core',
        sourcemap: true,
        globals,
      },
      {
        file: 'dist/cjs/index.min.js',
        format: 'umd',
        name: 'medplum.core',
        plugins: [terser()],
        sourcemap: true,
        globals,
      },
    ],
    plugins: [
      json(),
      resolve({ extensions }),
      typescript({ tsconfig: 'tsconfig.cjs.json', resolveJsonModule: true }),
      {
        buildEnd: () => {
          mkdirSync('./dist/cjs', { recursive: true });
          writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
        },
      },
    ],
    external: Object.keys(globals),
  },
  {
    input: 'src/index.ts',
    output: [
      {
        dir: 'dist/esm',
        format: 'esm',
        preserveModules: true,
        preserveModulesRoot: 'src',
        sourcemap: true,
      },
    ],
    plugins: [
      json(),
      resolve({ extensions }),
      typescript({ tsconfig: 'tsconfig.esm.json', resolveJsonModule: true }),
      {
        buildEnd: () => {
          mkdirSync('./dist/esm', { recursive: true });
          writeFileSync('./dist/esm/package.json', '{"type": "module"}');
        },
      },
    ],
    external: Object.keys(globals),
  },
];
