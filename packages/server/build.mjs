// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* global console */
/* global process */
/* eslint no-console: "off" */

import esbuild from 'esbuild';

const options = {
  entryPoints: ['./src/index.ts', './src/otel/instrumentation.ts'],
  bundle: true,
  platform: 'node',
  loader: { '.ts': 'ts' },
  resolveExtensions: ['.ts'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
  minify: false,
  sourcemap: true,
  packages: 'external',
};

esbuild
  .build({
    ...options,
    format: 'esm',
    outdir: './dist',
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
