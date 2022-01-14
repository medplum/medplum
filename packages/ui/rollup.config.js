import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';

const extensions = ['.ts', '.tsx'];

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/esm/index.js',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/esm/index.min.js',
      format: 'esm',
      plugins: [terser()],
      sourcemap: true,
    },
    {
      file: 'dist/cjs/index.js',
      format: 'umd',
      name: '@medplum/ui',
      sourcemap: true,
    },
    {
      file: 'dist/cjs/index.min.js',
      format: 'umd',
      name: '@medplum/ui',
      plugins: [terser()],
      sourcemap: true,
    },
  ],
  plugins: [peerDepsExternal(), postcss({ extract: 'styles.css' }), resolve({ extensions }), typescript()],
  external: ['@medplum/core', '@medplum/mock', 'react', 'react-dom', 'react-router-dom'],
};
