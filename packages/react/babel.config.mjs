// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export default {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
  plugins: [
    () => ({
      visitor: {
        MetaProperty(path) {
          if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
            // Replace "import.meta" with "process"
            path.replaceWithSourceString('process');
          }
        },
      },
    }),
  ],
};
