// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global console, process */

// Fails on URL-relative links in the docs, such as [FHIR basics](./docs/fhir-basics).
//
// Docusaurus leaves a relative link without a file extension as-is, and the browser
// resolves it against the current URL. The build renders each page at its canonical
// URL (/docs, no trailing slash), so these links pass `onBrokenLinks: 'throw'`. When a
// reader lands on /docs/ instead, the same link resolves to /docs/docs/fhir-basics.
//
// Use an absolute path (/docs/fhir-basics), which is what most of the docs use, or a
// link to the source file (./fhir-basics.md), which Docusaurus resolves at build time.
//
// Usage: node scripts/check-relative-links.mjs [dir...]   (default: docs blog)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKDOWN_LINK = /\]\((\.{1,2}\/[^)\s]*)/g;
const JSX_LINK = /\b(?:href|to|linkRef)=["'](\.{1,2}\/[^"']*)["']/g;

/**
 * Returns the URL-relative links in a markdown or MDX source, skipping code.
 * @param source - The file contents.
 * @returns The offending links with 1-based line numbers.
 */
export function findRelativeLinks(source) {
  const text = blankCode(source);
  const results = [];
  for (const pattern of [MARKDOWN_LINK, JSX_LINK]) {
    for (const match of text.matchAll(pattern)) {
      const link = match[1];
      if (!hasFileExtension(link)) {
        const line = text.slice(0, match.index).split('\n').length;
        results.push({ line, link });
      }
    }
  }
  return results.sort((a, b) => a.line - b.line);
}

/**
 * Returns true when the last path segment of a link names a file (./guide.md, ../diagram.png).
 * @param link - The link target.
 * @returns True if the link points to a file rather than a route.
 */
function hasFileExtension(link) {
  const pathname = link.split(/[?#]/)[0];
  const lastSegment = pathname.split('/').pop() ?? '';
  return /\.[a-z0-9]+$/i.test(lastSegment);
}

/**
 * Replaces fenced code blocks and inline code with spaces, keeping line numbers intact.
 * @param source - The file contents.
 * @returns The source with code blanked out.
 */
function blankCode(source) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return source.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank).replace(/`[^`\n]*`/g, blank);
}

/**
 * Lists the .md and .mdx files under a directory.
 * @param dir - The directory to walk.
 * @returns The file paths.
 */
export function listMarkdownFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

/**
 * Checks every markdown file under the given directories.
 * @param dirs - The directories to check.
 * @returns Every URL-relative link found.
 */
export function checkDirs(dirs) {
  return dirs.flatMap((dir) =>
    listMarkdownFiles(dir).flatMap((file) =>
      findRelativeLinks(fs.readFileSync(file, 'utf8')).map((result) => ({ file, ...result }))
    )
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dirs = process.argv.length > 2 ? process.argv.slice(2) : ['docs', 'blog'].map((d) => path.join(root, d));
  const results = checkDirs(dirs);
  for (const { file, line, link } of results) {
    console.error(`${path.relative(process.cwd(), file)}:${line}: URL-relative link "${link}"`);
  }
  if (results.length > 0) {
    console.error(
      `\nFound ${results.length} URL-relative link(s). Use an absolute path (/docs/...) or a link to the .md file.`
    );
    process.exit(1);
  }
  console.log('No URL-relative links found.');
}
