/* global console */
/* eslint no-console: "off" */

import esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const options = {
  entryPoints: ['./src/main.ts'],
  bundle: true,
  platform: 'node',
  loader: { '.js': 'js', '.ts': 'ts' },
  resolveExtensions: ['.js', '.ts'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
  external: ['iconv-lite', 'pdfmake'],
};

// The single executable application feature only supports running a single embedded CommonJS file.
// https://nodejs.org/dist/latest-v18.x/docs/api/single-executable-applications.html

const packageVersion = JSON.parse(readFileSync('./package.json')).version;

esbuild
  .build({
    ...options,
    format: 'cjs',
    outfile: './dist/cjs/index.cjs',
    define: { 'process.env.__MEDPLUM_VERSION__': `"${packageVersion}"` },
  })
  .then(() => writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}'))
  .catch(console.error);
