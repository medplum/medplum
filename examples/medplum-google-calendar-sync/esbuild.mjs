/* global console */
/* global process */
/* eslint no-console: "off" */
/*eslint no-process-exit: "off"*/

import esbuild from 'esbuild';
import { glob } from 'glob';

// Find all bot entry points, excluding test files
const entryPoints = glob.sync('./src/bots/**/*.ts').filter((file) => !file.endsWith('.test.ts'));

const external = ['dotenv', '@medplum/core'];

const esbuildOptions = {
  entryPoints: entryPoints,
  bundle: true,
  outdir: './dist/bots',
  platform: 'node',
  loader: {
    '.ts': 'ts',
  },
  resolveExtensions: ['.ts'],
  external,
  format: 'cjs',
  target: 'es2020',
  tsconfig: '../../tsconfig.json',
  footer: { js: 'Object.assign(exports, module.exports);' },
};

console.log('Compiling...');
esbuild
  .build(esbuildOptions)
  .then(() => {
    console.log('Build completed successfully!');
  })
  .catch((error) => {
    console.error('Build failed:', JSON.stringify(error, null, 2));
    process.exit(1);
  });
