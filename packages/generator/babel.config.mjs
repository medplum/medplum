// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { types } from '@babel/core';

const rewrites = {
  env: 'process.env',
  dirname: '__dirname',
};

export default {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
  plugins: [
    () => ({
      visitor: {
        MemberExpression(path) {
          if (types.isMetaProperty(path.node.object)) {
            const rewrite = rewrites[path.node.property.name];
            if (rewrite) {
              path.replaceWithSourceString(rewrite);
            }
          }
        },
      },
    }),
  ],
};
