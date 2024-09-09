/* global console */
/* eslint no-console: "off" */

import { execSync } from 'child_process';
import esbuild from 'esbuild';
import { writeFileSync } from 'fs';
import packageJson from './package.json' with { type: 'json' };

let gitHash;
try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (error) {
  gitHash = 'unknown'; // Default value when not in a git repository
}

const medplumVersion = packageJson.version + '-' + gitHash;

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
  define: {
    'import.meta.env.NODE_ENV': '"production"',
    'import.meta.env.MEDPLUM_VERSION': `"${medplumVersion}"`,
  },
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
