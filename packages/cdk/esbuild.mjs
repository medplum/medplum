/* global console */
/* eslint no-console: "off" */

import esbuild from 'esbuild';
import { writeFileSync } from 'fs';

const options = {
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  loader: { '.ts': 'ts' },
  resolveExtensions: ['.ts'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
  minify: true,
  external: [
    '@aws-sdk/client-acm',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sts',
    'aws-cdk-lib',
    'aws-cdk-lib/aws-ecr',
    'aws-cdk-lib/aws-rds',
    'cdk',
    'cdk-nag',
    'cdk-serverless-clamscan',
    'constructs',
  ],
};

esbuild
  .build({
    ...options,
    format: 'cjs',
    outfile: './dist/cjs/index.cjs',
  })
  .then(() => writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}'))
  .catch(console.error);

esbuild
  .build({
    ...options,
    format: 'esm',
    outfile: './dist/esm/index.mjs',
  })
  .then(() => writeFileSync('./dist/esm/package.json', '{"type": "module"}'))
  .catch(console.error);
