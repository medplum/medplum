import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import svgr from '@svgr/rollup';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

dotenv.config();

const extensions = ['.ts', '.tsx'];

const globals = {
  '@mantine/core': 'mantine.core',
  '@mantine/hooks': 'mantine.hooks',
  '@mantine/notifications': 'mantine.notifications',
  '@mantine/react': 'mantine.react',
  '@medplum/core': 'medplum.core',
  '@medplum/fhir-router': 'medplum.fhirRouter',
  '@medplum/mock': 'medplum.mock',
  'prop-types': 'PropTypes',
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
        file: 'dist/cjs/index.cjs',
        format: 'umd',
        name: 'medplum.react',
        sourcemap: true,
        sourcemapPathTransform,
        globals,
      },
      {
        file: 'dist/cjs/index.min.cjs',
        format: 'umd',
        name: 'medplum.react',
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
          'process.env.GOOGLE_AUTH_ORIGINS': `"${process.env.GOOGLE_AUTH_ORIGINS}"`,
          'process.env.GOOGLE_CLIENT_ID': `"${process.env.GOOGLE_CLIENT_ID}"`,
        },
      }),
      peerDepsExternal(),
      resolve({ extensions }),
      svgr(),
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
          'process.env.GOOGLE_AUTH_ORIGINS': `"${process.env.GOOGLE_AUTH_ORIGINS}"`,
          'process.env.GOOGLE_CLIENT_ID': `"${process.env.GOOGLE_CLIENT_ID}"`,
        },
      }),
      peerDepsExternal(),
      resolve({ extensions }),
      svgr(),
      typescript({ module: 'es6', outDir: 'dist/esm', declaration: false }),
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
