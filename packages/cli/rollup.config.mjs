import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { mkdirSync, writeFileSync } from 'fs';

const extensions = ['.ts'];

const globals = {
  '@medplum/core': 'medplum.core',
  dotenv: 'dotenv',
  fs: 'fs',
  'node-fetch': 'fetch',
  path: 'path',
};

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/cjs/index.cjs',
        format: 'cjs',
        name: 'medplum.cli',
        sourcemap: true,
        globals,
        banner: '#!/usr/bin/env node',
      },
    ],
    plugins: [
      resolve({ extensions }),
      typescript({ outDir: 'dist/cjs', declaration: false }),
      {
        buildEnd: () => {
          mkdirSync('./dist/cjs', { recursive: true });
          writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
        },
      },
    ],
    external: Object.keys(globals),
  },
];
