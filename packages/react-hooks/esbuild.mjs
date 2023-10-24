/* global console */
/* eslint no-console: "off" */

import dotenv from 'dotenv';
import esbuild from 'esbuild';
import { writeFileSync } from 'fs';

dotenv.config();

const options = {
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'browser',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  resolveExtensions: ['.js', '.ts', '.tsx'],
  target: 'es2021',
  tsconfig: 'tsconfig.json',
  minify: true,
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: ['@medplum/core', '@medplum/fhir-router', '@medplum/mock', 'prop-types', 'react', 'react-dom'],
};

esbuild
  .build({
    ...options,
    format: 'cjs',
    outfile: './dist/cjs/index.cjs',
  })
  .then(() => writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}'))
  .catch(console.error);

esbuild
  .build({
    ...options,
    format: 'esm',
    outfile: './dist/esm/index.mjs',
  })
  .then(() => writeFileSync('./dist/esm/package.json', '{"type": "module"}'))
  .catch(console.error);
