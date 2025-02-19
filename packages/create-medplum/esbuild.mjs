/* global console */
/* global process */
/* eslint no-console: "off" */

import esbuild from 'esbuild';
import { writeFileSync } from 'node:fs';

const options = {
  entryPoints: ['./src/main.ts'],
  bundle: true,
  platform: 'node',
  loader: { '.ts': 'ts' },
  resolveExtensions: ['.ts', '.js'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
  sourcemap: true,
};

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
