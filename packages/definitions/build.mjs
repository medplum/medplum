// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* global process */
/* eslint no-console: "off" */
/* eslint-disable no-undef */

import esbuild from 'esbuild';
import { writeFileSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Build FSH profiles first
console.log('Building FSH profiles...');
try {
  // Copy shared sushi-config.yaml to the profile directory
  const configSource = resolve(__dirname, 'src/fsh/sushi-config.yaml');
  const configDest = resolve(__dirname, 'src/fsh/medplum-base-subscription/sushi-config.yaml');
  copyFileSync(configSource, configDest);

  execSync('npm run build:fsh', { stdio: 'inherit', cwd: __dirname });

  // Merge FSH-generated profiles into profiles-medplum.json
  execSync('node scripts/build-profiles.mjs', { stdio: 'inherit', cwd: __dirname });
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
