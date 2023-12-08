/* global console */
/* global process */
/* eslint no-console: "off" */
/*eslint no-process-exit: "off"*/

import esbuild from 'esbuild';
import { glob } from 'glob';

// Find all TypeScript files in your source directory
const entryPoints = glob.sync('./src/**/*.ts').filter((file) => !file.endsWith('test.ts'));

const external = ['form-data', 'node-fetch', 'pdfmake', 'ssh2', 'ssh2-sftp-client', 'dotenv', '@medplum/core'];

// Define the esbuild options
const esbuildOptions = {
  entryPoints: entryPoints,
  bundle: true, // Bundle imported functions
  outdir: './dist', // Output directory for compiled files
  platform: 'node', // or 'node', depending on your target platform
  loader: {
    '.ts': 'ts', // Load TypeScript files
  },
  resolveExtensions: ['.ts'],
  external,
  format: 'cjs', // Set output format as ECMAScript modules
  target: 'es2020', // Set the target ECMAScript version
  tsconfig: 'tsconfig.json',
};

// Build using esbuild
esbuild
  .build(esbuildOptions)
  .then(() => {
    console.log('Build completed successfully!');
  })
  .catch((error) => {
    console.error('Build failed:', JSON.stringify(error, null, 2));
    process.exit(1);
  });
