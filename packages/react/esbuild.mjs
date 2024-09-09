/* global console */
/* global process */
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
  minifyWhitespace: true,
  minifyIdentifiers: false,
  minifySyntax: true,
  sourcemap: true,
  define: {
    'import.meta.env.NODE_ENV': '"production"',
    'import.meta.env.GOOGLE_AUTH_ORIGINS': `"${process.env.GOOGLE_AUTH_ORIGINS}"`,
    'import.meta.env.GOOGLE_CLIENT_ID': `"${process.env.GOOGLE_CLIENT_ID}"`,
  },
  external: [
    '@mantine/core',
    '@mantine/hooks',
    '@mantine/notifications',
    '@mantine/react',
    '@medplum/core',
    '@medplum/fhir-router',
    '@medplum/mock',
    'prop-types',
    'react',
    'react-dom',
    'react-router-dom',
  ],
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
