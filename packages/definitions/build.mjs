// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* global process */
/* eslint no-console: "off" */
/* eslint-disable no-undef */

import esbuild from 'esbuild';
import { cpSync, writeFileSync } from 'fs';

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
};

// Copy JSON files and other non-TypeScript files to dist directories
function copyDataFiles() {
  const srcFhirDir = './src/fhir';
  const distEsmFhirDir = './dist/fhir';
  cpSync(srcFhirDir, distEsmFhirDir, { recursive: true });
}

esbuild
  .build({
    ...options,
    format: 'cjs',
    outfile: './dist/cjs/index.cjs',
    logOverride: {
      'empty-import-meta': 'silent',
    },
  })
  .then(() => {
    writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
    copyDataFiles();
  })
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
  .then(() => {
    writeFileSync('./dist/esm/package.json', '{"type": "module"}');
    copyDataFiles();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
