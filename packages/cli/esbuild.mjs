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
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-cloudfront',
    '@aws-sdk/client-ecs',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sts',
    '@medplum/core',
    'commander',
    'dotenv',
    'fast-glob',
    'fs',
    'node-fetch',
    'path',
    'readline',
    'tar',
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
