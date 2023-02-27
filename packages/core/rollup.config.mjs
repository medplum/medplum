import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import packageJson from './package.json' assert { type: 'json' };

const extensions = ['.ts'];

const globals = {
  pdfmake: 'pdfmake',
  stream: 'stream',
};

const sourcemapPathTransform = (path) => path.replaceAll('\\', '/').replaceAll('../../../src', '../../src');

const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
const medplumVersion = packageJson.version + '-' + gitHash;

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/cjs/index.cjs',
        format: 'umd',
        name: 'medplum.core',
        sourcemap: true,
        sourcemapPathTransform,
        globals,
      },
      {
        file: 'dist/cjs/index.min.cjs',
        format: 'umd',
        name: 'medplum.core',
        plugins: [terser({ sourceMap: true })],
        sourcemapPathTransform,
        globals,
      },
    ],
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          'process.env.NODE_ENV': '"production"',
          'process.env.MEDPLUM_VERSION': `"${medplumVersion}"`,
        },
      }),
      json(),
      resolve({ extensions }),
      typescript({ outDir: 'dist/cjs', declaration: false }),
      {
        buildEnd: () => {
          mkdirSync('./dist/cjs', { recursive: true });
          writeFileSync('./dist/cjs/package.json', '{"type": "commonjs"}');
        },
      },
    ],
    external: Object.keys(globals),
  },
  {
    input: 'src/index.ts',
    output: [
      {
        dir: 'dist/esm',
        entryFileNames: '[name].mjs',
        format: 'esm',
        preserveModules: true,
        preserveModulesRoot: 'src',
        sourcemap: true,
        sourcemapPathTransform,
      },
      {
        file: 'dist/esm/index.min.mjs',
        format: 'esm',
        plugins: [terser({ sourceMap: true })],
        sourcemapPathTransform,
      },
    ],
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          'process.env.NODE_ENV': '"production"',
          'process.env.MEDPLUM_VERSION': `"${medplumVersion}"`,
        },
      }),
      json(),
      resolve({ extensions }),
      typescript({ module: 'es6', outDir: 'dist/esm', declaration: false }),
      {
        buildEnd: () => {
          mkdirSync('./dist/esm/node_modules/tslib', { recursive: true });
          writeFileSync('./dist/esm/package.json', '{"type": "module"}');
          writeFileSync('./dist/esm/node_modules/tslib/package.json', '{"type": "module"}');
        },
      },
    ],
    external: Object.keys(globals),
  },
];
