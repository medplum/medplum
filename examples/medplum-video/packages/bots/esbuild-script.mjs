/* global console */
/* global process */

import botLayer from '@medplum/bot-layer/package.json' with { type: 'json' };
import esbuild from 'esbuild';
import fastGlob from 'fast-glob';

const entryPoints = fastGlob.sync('./src/**/*.ts').filter((file) => !file.endsWith('test.ts') && !file.includes('/scripts/'));
const botLayerDeps = [...Object.keys(botLayer.dependencies), '@aws-sdk/client-*'];

esbuild
  .build({
    entryPoints,
    bundle: true,
    outdir: './dist',
    platform: 'node',
    loader: { '.ts': 'ts' },
    resolveExtensions: ['.ts', '.js'],
    external: botLayerDeps,
    format: 'cjs',
    target: 'es2020',
    tsconfig: 'tsconfig.json',
    footer: { js: 'Object.assign(exports, module.exports);' },
  })
  .then(() => console.log('Build completed successfully!'))
  .catch((error) => {
    console.error('Build failed:', JSON.stringify(error, null, 2));
    process.exit(1);
  });
