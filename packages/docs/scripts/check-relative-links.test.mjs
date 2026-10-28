// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkDirs, findRelativeLinks } from './check-relative-links.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('findRelativeLinks', () => {
  test('flags URL-relative markdown links', () => {
    assert.deepEqual(findRelativeLinks('[FHIR basics](./docs/fhir-basics)'), [{ line: 1, link: './docs/fhir-basics' }]);
    assert.deepEqual(findRelativeLinks('[Search](../search/basic-search#paging)'), [
      { line: 1, link: '../search/basic-search#paging' },
    ]);
  });

  test('flags URL-relative links in JSX attributes', () => {
    assert.deepEqual(findRelativeLinks('<Feature linkRef="./docs#get-started">'), [
      { line: 1, link: './docs#get-started' },
    ]);
    assert.deepEqual(findRelativeLinks("<Link to='../bots'>Bots</Link>"), [{ line: 1, link: '../bots' }]);
  });

  test('reports the line of each link', () => {
    const source = ['# Title', '', 'See [one](./one) and', '[two](../two).'].join('\n');
    assert.deepEqual(findRelativeLinks(source), [
      { line: 3, link: './one' },
      { line: 4, link: '../two' },
    ]);
  });

  test('allows absolute paths, file links, assets, external URLs and anchors', () => {
    const source = [
      '[a](/docs/fhir-basics)',
      '[b](./fhir-basics.md)',
      '[c](../search/basic-search.mdx#paging)',
      '![d](./diagram.png)',
      '[e](https://www.medplum.com/docs)',
      '[f](#get-started)',
      '<Link to="/docs/bots">Bots</Link>',
    ].join('\n');
    assert.deepEqual(findRelativeLinks(source), []);
  });

  test('ignores links inside code', () => {
    const source = ['```md', '[x](./not-a-link)', '```', 'Write `[y](./example)` like this.'].join('\n');
    assert.deepEqual(findRelativeLinks(source), []);
  });
});

// Regression: ./docs/fhir-basics on the docs landing page resolved to /docs/docs/fhir-basics
// when the page was loaded at /docs/. Keep the whole docs and blog tree free of these links.
test('docs and blog contain no URL-relative links', () => {
  const results = checkDirs([path.join(root, 'docs'), path.join(root, 'blog')]);
  assert.deepEqual(
    results.map(({ file, line, link }) => `${path.relative(root, file)}:${line} ${link}`),
    []
  );
});
