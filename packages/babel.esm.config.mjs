// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { types } from '@babel/core';

/**
 * Babel plugin to rewrite import.meta properties to old school properties
 * This is used to ensure that the code runs correctly in both CommonJS and ESM environments
 */
const rewrites = {
  env: 'process.env',
  dirname: '__dirname',
  main: 'require.main === module',
  url: '__dirname',
};

function esmPlugin() {
  return {
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
  };
}

export default esmPlugin;
