// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global process */
/* global console */

import esbuild from 'esbuild';
import { writeFileSync } from 'fs';

const options = {
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'browser',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  logLevel: 'info',
  resolveExtensions: ['.ts', '.tsx'],
  target: 'es2021',
  tsconfig: 'tsconfig.build.json',
  minifyWhitespace: true,
  minifyIdentifiers: false,
  minifySyntax: true,
  sourcemap: true,
  external: ['@medplum/core', '@medplum/health-gorilla-core', '@medplum/mock', '@medplum/react', 'react'],
};

esbuild
  .build({
    ...options,
    format: 'cjs',
    outfile: './dist/cjs/index.cjs',
  })
  .then(() => writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}'))
  .catch((error) => {
    console.error('Build failed:', JSON.stringify(error, null, 2));
    process.exit(1);
  });

esbuild
  .build({
    ...options,
    format: 'esm',
    outfile: './dist/esm/index.mjs',
  })
  .then(() => writeFileSync('./dist/esm/package.json', '{"type": "module"}'))
  .catch((error) => {
    console.error('Build failed:', JSON.stringify(error, null, 2));
    process.exit(1);
  });
