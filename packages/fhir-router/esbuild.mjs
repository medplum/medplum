// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global process */
/* global console */

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
  sourcemap: true,
  external: ['@medplum/core', 'dataloader', 'rfc6902', 'node:sqlite'],
};

const sqliteOptions = {
  ...options,
  entryPoints: ['./src/sqlite/index.ts'],
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

esbuild
  .build({
    ...sqliteOptions,
    format: 'cjs',
    outfile: './dist/cjs/sqlite/index.cjs',
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

esbuild
  .build({
    ...sqliteOptions,
    format: 'esm',
    outfile: './dist/esm/sqlite/index.mjs',
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
