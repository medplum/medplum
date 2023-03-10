import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { mkdirSync, writeFileSync } from 'fs';

const external = [
  '@aws-sdk/client-acm',
  '@aws-sdk/client-ssm',
  '@aws-sdk/client-sts',
  'aws-cdk-lib',
  'aws-cdk-lib/aws-ecr',
  'cdk',
  'cdk-nag',
  'cdk-serverless-clamscan',
  'constructs',
];

const extensions = ['.ts'];

const plugins = [
  resolve({ extensions }),
  typescript({ outDir: 'dist/cjs', declaration: false }),
  {
    buildEnd: () => {
      mkdirSync('./dist/cjs', { recursive: true });
      writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
    },
  },
];

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/cjs/index.cjs',
        format: 'cjs',
        sourcemap: true,
      },
    ],
    plugins,
    external,
  },
  {
    input: 'src/init.ts',
    output: [
      {
        file: 'dist/cjs/init.cjs',
        format: 'cjs',
        sourcemap: true,
        banner: '#!/usr/bin/env node',
      },
    ],
    plugins,
    external,
  },
];
