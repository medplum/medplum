import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import copy from 'rollup-plugin-copy';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';

dotenv.config();

const extensions = ['.ts', '.tsx'];

const globals = {
  '@medplum/core': 'medplum.core',
  '@medplum/mock': 'medplum.mock',
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-router-dom': 'ReactRouterDOM',
};

const sourcemapPathTransform = (path) => path.replaceAll('\\', '/').replaceAll('../../../src', '../../src');

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/cjs/index.js',
        format: 'umd',
        name: 'medplum.ui',
        sourcemap: true,
        sourcemapPathTransform,
        globals,
      },
      {
        file: 'dist/cjs/index.min.js',
        format: 'umd',
        name: 'medplum.ui',
        plugins: [terser()],
        sourcemap: true,
        sourcemapPathTransform,
        globals,
      },
    ],
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          'process.env.NODE_ENV': '"production"',
          'process.env.GOOGLE_AUTH_ORIGINS': `"${process.env.GOOGLE_AUTH_ORIGINS}"`,
          'process.env.GOOGLE_CLIENT_ID': `"${process.env.GOOGLE_CLIENT_ID}"`,
        },
      }),
      peerDepsExternal(),
      postcss({ extract: 'styles.css' }),
      resolve({ extensions }),
      typescript({ tsconfig: 'tsconfig.cjs.json', resolveJsonModule: true }),
      copy({
        targets: [{ src: 'src/defaulttheme.css', dest: 'dist/cjs/' }],
      }),
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
        format: 'esm',
        preserveModules: true,
        preserveModulesRoot: 'src',
        sourcemap: true,
        sourcemapPathTransform,
      },
      {
        file: 'dist/esm/index.min.js',
        format: 'esm',
        plugins: [terser()],
        sourcemap: true,
        sourcemapPathTransform,
      },
    ],
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          'process.env.NODE_ENV': '"production"',
          'process.env.GOOGLE_AUTH_ORIGINS': `"${process.env.GOOGLE_AUTH_ORIGINS}"`,
          'process.env.GOOGLE_CLIENT_ID': `"${process.env.GOOGLE_CLIENT_ID}"`,
        },
      }),
      peerDepsExternal(),
      postcss({ extract: 'styles.css' }),
      resolve({ extensions }),
      typescript({ tsconfig: 'tsconfig.esm.json', resolveJsonModule: true }),
      copy({
        targets: [{ src: 'src/defaulttheme.css', dest: 'dist/esm/' }],
      }),
      {
        buildEnd: () => {
          mkdirSync('./dist/esm', { recursive: true });
          writeFileSync('./dist/esm/package.json', '{"type": "module"}');
        },
      },
    ],
    external: Object.keys(globals),
  },
];
