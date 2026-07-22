// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global process */
/* global console */

import dotenv from 'dotenv';
import esbuild from 'esbuild';
import { writeFileSync } from 'fs';

dotenv.config({ quiet: true });

const options = {
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'browser',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  resolveExtensions: ['.js', '.ts', '.tsx'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
  minifyWhitespace: true,
  minifyIdentifiers: false,
  minifySyntax: true,
  sourcemap: true,
  external: [
    '@mantine/core',
    '@mantine/hooks',
    '@mantine/notifications',
    '@mantine/spotlight',
    '@mantine/react',
    '@medplum/core',
    '@medplum/react',
    '@medplum/react-hooks',
    'react',
    'react-dom',
  ],
};

esbuild
  .build({
    ...options,
    define: {
      ...options.define,
      'import.meta.env': 'process.env',
    },
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
