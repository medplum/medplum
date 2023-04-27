import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { mkdirSync, writeFileSync } from 'fs';

const extensions = ['.ts'];

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/cjs/index.cjs',
        format: 'cjs',
        sourcemap: true,
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
    external: [
      '@aws-sdk/client-cloudformation',
      '@aws-sdk/client-cloudfront',
      '@aws-sdk/client-ecs',
      '@aws-sdk/client-s3',
      '@medplum/core',
      'commander',
      'dotenv',
      'fast-glob',
      'fs',
      'node-fetch',
      'path',
      'tar',
    ],
  },
];
