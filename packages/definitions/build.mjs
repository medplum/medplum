// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* global process */
/* eslint no-console: "off" */
/* eslint-disable no-undef */

import { execSync } from 'child_process';
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

// Build FSH profiles first
console.log('Building FSH profiles...');
try {
  execSync('npm run build:fsh', { stdio: 'inherit' });

  // Merge FSH-generated profiles into profiles-medplum.json
  execSync('node scripts/build-profiles.mjs', { stdio: 'inherit' });
} catch (error) {
  console.warn('Warning: FSH build failed or no profiles to merge:', error.message);
  // Continue with regular build even if FSH build fails
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
