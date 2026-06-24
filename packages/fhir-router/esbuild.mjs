// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global process */
/* global console */

import esbuild from 'esbuild';
import { writeFileSync } from 'fs';

const sharedOptions = {
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

const entries = [
  { entry: './src/index.ts', name: 'index' },
  { entry: './src/sqlite/index.ts', name: 'sqlite' },
];

try {
  for (const { entry, name } of entries) {
    await esbuild.build({
      ...sharedOptions,
      entryPoints: [entry],
      format: 'cjs',
      outfile: `./dist/cjs/${name}.cjs`,
    });

    await esbuild.build({
      ...sharedOptions,
      entryPoints: [entry],
      format: 'esm',
      outfile: `./dist/esm/${name}.mjs`,
    });
  }

  writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
  writeFileSync('./dist/esm/package.json', '{"type": "module"}');
} catch (err) {
  console.error(err);
  process.exit(1);
}
