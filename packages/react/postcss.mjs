// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global console */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import postcss from 'postcss';
import config from './postcss.config.mjs';

// esbuild bundles imported CSS into a single stylesheet next to each JS bundle,
// but it does not run PostCSS. Process the emitted stylesheets through the
// Mantine PostCSS pipeline so that Mantine-specific syntax (e.g.
// `$mantine-breakpoint-xs`) is resolved before the package is published.
const cssFiles = ['./dist/esm/index.css', './dist/cjs/index.css'];

for (const cssFile of cssFiles) {
  if (!existsSync(cssFile)) {
    console.warn(`postcss: ${cssFile} not found, skipping`);
    continue;
  }
  const mapFile = `${cssFile}.map`;
  const prev = existsSync(mapFile) ? readFileSync(mapFile, 'utf8') : false;
  const result = await postcss(config.plugins).process(readFileSync(cssFile, 'utf8'), {
    from: cssFile,
    to: cssFile,
    map: { inline: false, prev },
  });
  writeFileSync(cssFile, result.css);
  if (result.map) {
    writeFileSync(mapFile, result.map.toString());
  }
  console.log(`postcss: processed ${cssFile}`);
}
