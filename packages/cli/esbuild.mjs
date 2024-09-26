/* global console */
/* global process */
/* eslint no-console: "off" */

import esbuild from 'esbuild';
import { writeFileSync } from 'node:fs';

const options = {
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  loader: { '.ts': 'ts' },
  resolveExtensions: ['.ts', '.js'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
  minify: true,
  sourcemap: true,
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
    'iconv-lite',
    'node-fetch',
    'tar',
  ],
  banner: { js: '#!/usr/bin/env node' },
};

esbuild
  .build({
    ...options,
    format: 'cjs',
    outfile: './dist/cjs/index.cjs',
  })
  .then(() => writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

esbuild
  .build({
    ...options,
    format: 'esm',
    outfile: './dist/esm/index.mjs',
  })
  .then(() => writeFileSync('./dist/esm/package.json', '{"type": "module"}'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
