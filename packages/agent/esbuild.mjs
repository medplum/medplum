// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global process */
/* global console */

import esbuild from 'esbuild';
import { writeFileSync } from 'node:fs';

const options = {
  entryPoints: ['./src/main.ts'],
  bundle: true,
  platform: 'node',
  loader: { '.js': 'js', '.ts': 'ts' },
  resolveExtensions: ['.js', '.ts'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
};

// The single executable application feature only supports running a single embedded CommonJS file.
// https://nodejs.org/dist/latest-v18.x/docs/api/single-executable-applications.html

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
