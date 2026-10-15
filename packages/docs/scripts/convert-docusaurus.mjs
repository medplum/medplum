#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Regenerates content/, static/, and data/sidebar.yml from the Docusaurus site at a git ref.
// Temporary: keeps the Hugo site in sync with docs edits on main until the Docusaurus sources are removed.
//
// Usage: node scripts/convert-docusaurus.mjs [git-ref]   (default: origin/main)
//
// Everything in content/ is regenerated except HAND_WRITTEN, the pages built for Hugo directly.

/* global console */
/* global process */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ref = process.argv[2] ?? 'origin/main';
const hugoRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(hugoRoot, '../..');
const contentRoot = path.join(hugoRoot, 'content');

// Content paths (relative to content/) not generated from Docusaurus; a trailing slash marks a directory
const HAND_WRITTEN = [
  '_index.md',
  'about.md',
  'blog/_index.md',
  'case-studies.md',
  'docs/sdk/',
  'enterprise.md',
  'posts/',
  'pricing.md',
  'products/_index.md',
  'solutions/_index.md',
];

// Docusaurus directories generated from FHIR definitions and the SDK build; Hugo renders those itself
const SKIPPED_SOURCE_DIRS = ['docs/sdk', 'docs/api/fhir/resources', 'docs/api/fhir/datatypes', 'docs/api/fhir/medplum'];

const SOURCE_ROOTS = [
  { source: 'blog', dest: 'blog' },
  { source: 'docs', dest: 'docs' },
  { source: 'src/pages', dest: '' },
];

const ASSET_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|mp4|webm|pdf|zip|json|csv|txt|docx?|xlsx?)$/i;

// @medplum/mock, for code blocks that interpolate mock data (requires a built packages/mock)
const mockModule = await import('@medplum/mock');

const warnings = [];
function warn(message) {
  warnings.push(message);
}

async function main() {
  const docusaurusRoot = exportDocusaurus(ref);
  console.log(`Converting packages/docs at ${ref}`);

  const pages = collectPages(docusaurusRoot);
  const urlBySource = new Map(pages.map((p) => [p.sourcePath, p.url]));

  removeGeneratedContent();
  for (const page of pages) {
    writePage(page, urlBySource);
  }
  syncStatic(docusaurusRoot);
  await writeSidebar(docusaurusRoot, pages);

  fs.rmSync(path.dirname(docusaurusRoot), { recursive: true, force: true });
  console.log(`Wrote ${pages.length} pages`);
  for (const w of warnings) {
    console.warn(`WARN ${w}`);
  }
}

function exportDocusaurus(gitRef) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docusaurus-'));
  execSync(`git archive ${gitRef} packages/docs | tar -x -C ${tmp}`, { cwd: repoRoot, stdio: 'inherit' });
  return path.join(tmp, 'packages/docs');
}

// ---------------------------------------------------------------------------------------------------------------------
// Planning: where each Docusaurus page lands in content/, and its URL
// ---------------------------------------------------------------------------------------------------------------------

function collectPages(docusaurusRoot) {
  const pages = [];
  for (const { source, dest } of SOURCE_ROOTS) {
    const sourceRoot = path.join(docusaurusRoot, source);
    for (const sourcePath of walk(sourceRoot)) {
      const rel = toPosix(path.relative(docusaurusRoot, sourcePath));
      if (!/\.mdx?$/.test(rel) || isPartial(rel) || SKIPPED_SOURCE_DIRS.some((d) => rel.startsWith(d + '/'))) {
        continue;
      }
      const raw = fs.readFileSync(sourcePath, 'utf8');
      const { frontMatter, body } = splitFrontMatter(raw);
      const assets = findLocalAssets(body, path.dirname(sourcePath));
      const destPath = planDestPath(sourcePath, sourceRoot, dest, assets.length > 0);
      pages.push({ sourcePath, frontMatter, body, assets, destPath, section: dest || 'pages' });
    }
  }
  for (const page of pages) {
    page.url = planUrl(page);
  }
  return pages;
}

function isPartial(rel) {
  return path.basename(rel).startsWith('_');
}

function planDestPath(sourcePath, sourceRoot, destRoot, hasAssets) {
  const rel = toPosix(path.relative(sourceRoot, sourcePath)).replace(/\.mdx?$/, '');
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel);
  const join = (...parts) => path.posix.join(destRoot, ...parts.filter((p) => p && p !== '.'));

  if (base === 'index' || (base === 'home' && dir === '.')) {
    return join(dir, '_index.md');
  }
  // Docusaurus serves foo/foo.md at /foo; Hugo's equivalent is the page bundle foo/index.md
  if (path.posix.basename(dir) === base) {
    return join(dir, hasChildPages(path.dirname(sourcePath), sourcePath) ? '_index.md' : 'index.md');
  }
  // Pages with images next to them become bundles so Hugo publishes the images
  if (hasAssets) {
    const siblingDir = path.join(path.dirname(sourcePath), base);
    return join(dir, base, fs.existsSync(siblingDir) && hasChildPages(siblingDir) ? '_index.md' : 'index.md');
  }
  return join(dir, base + '.md');
}

function hasChildPages(dir, exclude) {
  return walk(dir).some((f) => f !== exclude && /\.mdx?$/.test(f) && !isPartial(f));
}

function planUrl({ destPath, frontMatter, section }) {
  const slug = getField(frontMatter, 'slug');
  if (section === 'blog' && !destPath.endsWith('_index.md')) {
    if (slug) {
      return '/blog/' + slug.replace(/^\//, '');
    }
    // Docusaurus derives the URL of a post without a slug from its dated file or folder name
    const match = /(\d{4})-(\d{2})-(\d{2})-([^/]+?)(?:\/(?:_?index)\.md|\.md)$/.exec(destPath);
    return match ? `/blog/${match[1]}/${match[2]}/${match[3]}/${match[4]}` : '/' + stripPage(destPath);
  }
  // Docusaurus doc slugs starting with "/" are relative to the docs root
  if (section === 'docs' && slug?.startsWith('/')) {
    return slug === '/' ? '/docs' : '/docs' + slug;
  }
  return '/' + stripPage(destPath);
}

function stripPage(destPath) {
  return destPath.replace(/\/?(_index|index)\.md$/, '').replace(/\.md$/, '');
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------------------------------

function removeGeneratedContent() {
  for (const file of walk(contentRoot)) {
    const rel = toPosix(path.relative(contentRoot, file));
    if (!HAND_WRITTEN.some((h) => (h.endsWith('/') ? rel.startsWith(h) : rel === h))) {
      fs.rmSync(file);
    }
  }
  removeEmptyDirs(contentRoot);
}

function writePage(page, urlBySource) {
  const { sourcePath, destPath } = page;
  const destFile = path.join(contentRoot, destPath);
  const bundleDir = path.dirname(destFile);
  fs.mkdirSync(bundleDir, { recursive: true });

  let body = page.body;
  body = inlinePartials(body, path.dirname(sourcePath));
  body = convertBody(body, sourcePath);
  body = copyAssets(body, page, bundleDir);
  body = rewriteDocLinks(body, sourcePath, urlBySource);

  const frontMatter = convertFrontMatter(page, body);
  body = body.replace(/^# .+\n?/m, ''); // The layout renders the title

  fs.writeFileSync(destFile, cleanupWhitespace(frontMatter + '\n\n' + body.trimStart()), 'utf8');
}

function convertFrontMatter(page, body) {
  const lines = page.frontMatter ? page.frontMatter.split('\n').slice(1, -1) : [];
  const has = (key) => lines.some((l) => l.startsWith(key + ':'));
  const result = [];

  for (let line of lines) {
    // Hugo treats weight 0 as unweighted (sorted last) and weights are integers, while Docusaurus positions
    // can be 0 or fractional (2.5), so map them to round(position * 10) + 10
    if (line.startsWith('sidebar_position:')) {
      line = `weight: ${Math.round(Number.parseFloat(line.slice('sidebar_position:'.length)) * 10) + 10}`;
    }
    if (line.startsWith('title:')) {
      line = line.replace(/`/g, '');
    }
    // Docs slugs relative to the docs root become explicit URLs (or nothing, for the docs home)
    if (page.section === 'docs' && /^slug:\s*['"]?\//.test(line)) {
      continue;
    }
    result.push(line);
  }

  if (!has('id')) {
    result.unshift(`id: ${path.basename(page.sourcePath).replace(/\.mdx?$/, '')}`);
  }
  if (!has('title')) {
    const heading = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? (warn(`No title: ${page.sourcePath}`), 'Untitled');
    const title = heading.replace(/`/g, '');
    result.splice(1, 0, `title: ${title.includes(':') ? JSON.stringify(title) : title}`);
  }
  if (page.url !== '/' + stripPage(page.destPath) && !has('slug')) {
    result.push(`url: ${page.url}`);
  }
  return ['---', ...result, '---'].join('\n');
}

// Inline `import Foo from './_foo.mdx'` partials where `<Foo />` is used
function inlinePartials(body, sourceDir) {
  const imports = [...body.matchAll(/^import (\w+) from ['"](\.{1,2}\/[^'"]+\.mdx?)['"];?$/gm)];
  for (const [line, name, rel] of imports) {
    const partial = splitFrontMatter(fs.readFileSync(path.resolve(sourceDir, rel.replace(/\\_/g, '_')), 'utf8')).body;
    body = body.replace(line, '').replaceAll(new RegExp(`<${name}\\s*/>`, 'g'), partial.trim());
  }
  return body;
}

function convertBody(body, sourcePath) {
  body = convertCodeExamples(body, sourcePath);

  // Imported images (`import diagram from './diagram.png'`) become their relative path
  for (const [line, name, rel] of body.matchAll(/^import (\w+) from ['"](\.{1,2}\/[^'"]+)['"];?$/gm)) {
    if (ASSET_EXTENSIONS.test(rel)) {
      body = body.replace(line, '').replaceAll(`{${name}}`, `"${rel}"`);
    }
  }

  body = body
    .replace(/^import .+ from .+;?$/gm, '') // Remaining MDX imports (React components)
    .replaceAll('```cli', '```bash')
    .replaceAll('```curl', '```bash')
    .replaceAll('```fsh', '```txt')
    .replaceAll('```PLpgSQL', '```sql')
    .replaceAll('{/* truncate */}', '<!--more-->')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments
    .replace(/className=/g, 'class=');

  body = convertJsxAttributes(body);
  body = fixHtmlTables(body);
  body = fixHighlightLines(body);
  body = fixAdmonitions(body);
  body = fixTabs(body);
  body = fixLandingComponents(body);
  return body;
}

// <MedplumCodeBlock language="ts" selectBlocks="a,b">{Example}</MedplumCodeBlock>, with
// `import Example from '!!raw-loader!@site/../examples/src/foo.ts'`, becomes a code-example shortcode that reads
// the example file at build time, so the docs keep showing the type-checked source.
function convertCodeExamples(body, sourcePath) {
  const files = {};
  for (const [line, name, spec] of body.matchAll(/^import (\w+) from ['"]!!raw-loader!([^'"]+)['"];?$/gm)) {
    files[name] = repoRelative(spec, sourcePath);
    body = body.replace(line, '');
  }

  // Shortcodes are unindented: an indented shortcode would render as a Markdown code block
  return body
    .replace(/^[ \t]*<(MedplumCodeBlock|CodeBlock)\b([^>]*)>\s*\{(\w+)\}\s*<\/\1>/gm, (match, _component, attrs, name) => {
      const file = files[name];
      if (!file) {
        warn(`Unknown code example ${name} in ${sourcePath}`);
        return match;
      }
      const { language, blocks, title, lineNumbers, highlight } = codeBlockAttributes(attrs);
      const params = [`file="${file}"`];
      if (language) {
        params.push(`language="${language}"`);
      }
      if (blocks) {
        params.push(`blocks="${blocks}"`);
      }
      if (title) {
        params.push(`title="${title}"`);
      }
      if (lineNumbers) {
        params.push('lineNumbers="true"');
      }
      if (highlight) {
        params.push(`highlight="${highlight}"`);
      }
      return `{{< code-example ${params.join(' ')} >}}`;
    })
    .replace(/^[ \t]*<(MedplumCodeBlock|CodeBlock)\b([^>]*)>\s*\{([\s\S]*?)\}\s*<\/\1>/gm, (match, _component, attrs, expression) => {
      const { language, lineNumbers, highlight } = codeBlockAttributes(attrs);
      const options = [lineNumbers && 'linenos=table', highlight && `hl_lines=${highlight.replaceAll(',', ' ')}`].filter(Boolean);
      const code = dedent(evaluateExpression(expression, body, sourcePath));
      return `{{< highlight ${language ?? 'text'}${options.length ? ` "${options.join(',')}"` : ''} >}}\n${code}\n{{< /highlight >}}`;
    });
}

function codeBlockAttributes(attrs) {
  const attr = (key) => new RegExp(`${key}=["']([^"']*)["']`).exec(attrs)?.[1];
  return {
    language: attr('language'),
    blocks: attr('selectBlocks'),
    title: attr('title'),
    lineNumbers: /\bshowLineNumbers\b/.test(attrs),
    highlight: attr('metastring')
      ?.match(/\{([\d,\s-]+)\}/)?.[1]
      ?.replace(/\s/g, ''),
  };
}

// Docusaurus evaluates inline code ({`...`} or {expression}) as JS, sometimes using @medplum/mock data
function evaluateExpression(expression, body, sourcePath) {
  const names = [...body.matchAll(/^import \{([^}]+)\} from ['"]@medplum\/mock['"];?$/gm)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
  // eslint-disable-next-line no-new-func -- evaluating the docs' own code blocks, as MDX did
  const evaluate = (expr) => String(new Function(...names, `return (${expr});`)(...names.map((n) => mockModule[n])));
  try {
    return evaluate(expression);
  } catch (err) {
    // MDX ignores a stray "}" after the expression (family-relationships has one)
    try {
      return evaluate(expression.replace(/\}\s*$/, ''));
    } catch {
      warn(`Could not evaluate code block in ${sourcePath}: ${err.message}`);
      return expression;
    }
  }
}

function dedent(code) {
  const lines = code.replace(/^\s*\n|\n\s*$/g, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

function repoRelative(spec, sourcePath) {
  const docsDir = sourcePath.slice(0, sourcePath.indexOf('/packages/docs/') + '/packages/docs'.length);
  const absolute = spec.startsWith('@site/') ? path.join(docsDir, spec.slice('@site/'.length)) : path.resolve(path.dirname(sourcePath), spec);
  return toPosix(path.relative(path.resolve(docsDir, '../..'), absolute));
}

// JSX attribute syntax that isn't valid HTML: style={{maxWidth: '100%'}}, src={"..."}, width={50}
function convertJsxAttributes(body) {
  return body
    .replace(/style=\{\{([^}]*)\}\}/g, (_, obj) => {
      const declarations = [...obj.matchAll(/(\w+)\s*:\s*(?:(['"])(.*?)\2|([\d.]+))/g)].map(
        ([, key, , str, num]) => `${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}: ${str ?? num + 'px'}`
      );
      return `style="${declarations.join('; ')}"`;
    })
    .replace(/(\s[\w-]+)=\{\s*(['"])(.*?)\2\s*\}/g, '$1="$3"')
    .replace(/(\s[\w-]+)=\{([\d.]+)\}/g, '$1="$2"');
}

// MDX parses Markdown inside JSX, but Markdown treats an HTML block as raw HTML that ends at the first blank line.
// So in HTML tables, drop blank lines and convert the inline Markdown (bold, links) to HTML.
function fixHtmlTables(body) {
  return body.replace(/^[ \t]*<table[\s\S]*?<\/table>/gm, (table) =>
    table
      .replace(/\n[ \t]*(?=\n)/g, '')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  );
}

// Relative references to files next to the page (images, videos, downloads)
function findLocalAssets(body, sourceDir) {
  const refs = new Set();
  const patterns = [
    /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, // Markdown images
    /\]\(([^)\s#]+)\)/g, // Markdown links to files
    /\s(?:src|poster|href)=\{?["']([^"']+)["']\}?/g, // HTML attributes
    /^import \w+ from ['"](\.{1,2}\/[^'"]+)['"];?$/gm, // Imported images
  ];
  for (const pattern of patterns) {
    for (const [, ref] of body.matchAll(pattern)) {
      if (!/^([a-z]+:|\/|#)/i.test(ref) && ASSET_EXTENSIONS.test(ref) && !ref.startsWith('!!raw-loader')) {
        if (fs.existsSync(path.resolve(sourceDir, decodeURI(ref)))) {
          refs.add(ref);
        } else {
          warn(`Missing asset ${ref} in ${sourceDir}`);
        }
      }
    }
  }
  return [...refs];
}

// Copies a page's assets into its bundle. Markdown images keep a bundle-relative name (resolved by the image render
// hook); other references get an absolute URL, since relative URLs resolve against the parent of a slashless page URL.
function copyAssets(body, page, bundleDir) {
  for (const ref of page.assets) {
    const source = path.resolve(path.dirname(page.sourcePath), decodeURI(ref));
    const name = path.basename(source);
    fs.copyFileSync(source, path.join(bundleDir, name));
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Mark rewritten images (\0) so the second pass can't match them when the ref is already a bare name
    body = body
      .replace(new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}([\\s)])`, 'g'), `$1\0${name}$2`)
      .replace(new RegExp(`(\\]\\(|["'])${escaped}([)"'])`, 'g'), `$1${page.url}/${name}$2`);
  }
  return body.replaceAll('\0', '');
}

// Docusaurus resolves links to .md/.mdx files to the target page's URL
function rewriteDocLinks(body, sourcePath, urlBySource) {
  return body.replace(/\]\(((?!https?:)[^)\s#]+\.mdx?)(#[^)\s]*)?\)/g, (match, target, anchor = '') => {
    const resolved = target.startsWith('/')
      ? path.join(sourcePath.slice(0, sourcePath.indexOf('/packages/docs/') + '/packages/docs'.length), 'docs', target.replace(/^\/docs\//, '/'))
      : path.resolve(path.dirname(sourcePath), decodeURI(target));
    const url = urlBySource.get(resolved) ?? generatedDocUrl(resolved);
    if (!url) {
      warn(`Unresolved doc link ${target} in ${sourcePath}`);
      return match;
    }
    return `](${url}${anchor})`;
  });
}

// URL of a page in a directory Hugo generates itself (SDK, FHIR reference), at the same path as on Docusaurus
function generatedDocUrl(sourcePath) {
  const rel = /\/packages\/docs\/(docs\/.+)\.mdx?$/.exec(sourcePath)?.[1];
  return rel && SKIPPED_SOURCE_DIRS.some((d) => rel.startsWith(d + '/')) ? '/' + rel : undefined;
}

// Mirrors Docusaurus's static/ (minus the generated FHIR definitions), keeping files that Hugo-only layouts use
function syncStatic(docusaurusRoot) {
  const sourceStatic = path.join(docusaurusRoot, 'static');
  const destStatic = path.join(hugoRoot, 'static');
  const hugoOnlySources = ['layouts', 'assets', 'data', 'hugo.toml']
    .flatMap((p) => walk(path.join(hugoRoot, p)))
    .filter((f) => /\.(html|toml|ya?ml|json|scss|css|mjs|js|md)$/.test(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');

  for (const file of walk(destStatic)) {
    const rel = toPosix(path.relative(destStatic, file));
    if (!fs.existsSync(path.join(sourceStatic, rel)) && !hugoOnlySources.includes('/' + rel)) {
      fs.rmSync(file);
    }
  }
  for (const file of walk(sourceStatic)) {
    const rel = toPosix(path.relative(sourceStatic, file));
    if (rel.startsWith('data/')) {
      continue;
    }
    fs.mkdirSync(path.dirname(path.join(destStatic, rel)), { recursive: true });
    fs.copyFileSync(file, path.join(destStatic, rel));
  }
  removeEmptyDirs(destStatic);
}

// Converts the Docusaurus docs sidebar (sidebars.ts) to data/sidebar.yml (rendered by layouts/partials/sidebar.html).
// Node strips the TypeScript types on import. Item types:
//   header        { value }                  <- html '<strong>Title</strong>' items
//   doc           { id, label? }             <- 'id' strings and { type: 'doc' } items
//   category      { label, id?, items }      <- id is the Hugo page for the category's link doc, if any
//   autogenerated { dir }                    <- { type: 'autogenerated', dirName }; Hugo lists the section's pages
// Docusaurus's shorthand categories ({ 'Label': [items] } or { 'Label': { 'Sub': [items] } }) become categories too.
async function writeSidebar(docusaurusRoot, pages) {
  const { default: sidebars } = await import(pathToFileURL(path.join(docusaurusRoot, 'sidebars.ts')).href);

  // Docusaurus doc id (path under docs/ without extension) -> Hugo page path
  const hugoPathById = new Map(
    pages
      .filter((p) => p.section === 'docs')
      .map((p) => [toPosix(path.relative(path.join(docusaurusRoot, 'docs'), p.sourcePath)).replace(/\.mdx?$/, ''), stripPage(p.destPath)])
  );
  const toHugoPath = (id) => {
    const hugoPath = hugoPathById.get(id);
    if (!hugoPath && !SKIPPED_SOURCE_DIRS.some((d) => `docs/${id}`.startsWith(d + '/'))) {
      warn(`Sidebar doc not found: ${id}`);
    }
    return hugoPath ?? `docs/${id}`;
  };

  const convertItems = (items) => items.flatMap(convert);
  const convert = (item) => {
    if (typeof item === 'string') {
      return { type: 'doc', id: toHugoPath(item) };
    }
    if (!item.type) {
      return Object.entries(item).map(([label, value]) => ({
        type: 'category',
        label,
        items: Array.isArray(value) ? convertItems(value) : convert(value),
      }));
    }
    switch (item.type) {
      case 'html':
        return { type: 'header', value: item.value.replace(/<[^>]+>/g, '') };
      case 'doc':
        return { type: 'doc', id: toHugoPath(item.id), ...(item.label ? { label: item.label } : {}) };
      case 'autogenerated':
        return { type: 'autogenerated', dir: `docs/${item.dirName}` };
      case 'category':
        return {
          type: 'category',
          label: item.label,
          ...(item.link?.type === 'doc' ? { id: toHugoPath(item.link.id) } : {}),
          items: convertItems(item.items),
        };
      default:
        throw new Error('Unsupported sidebar item type: ' + item.type);
    }
  };

  const header = '# GENERATED by scripts/convert-docusaurus.mjs from the Docusaurus sidebars.ts. Do not edit by hand.\n';
  fs.writeFileSync(path.join(hugoRoot, 'data/sidebar.yml'), header + toYaml({ items: convertItems(sidebars.docsSidebar) }) + '\n', 'utf8');
}

// Minimal YAML writer for the sidebar's shape (objects, arrays, strings); JSON strings are valid YAML scalars
function toYaml(value, indent = '') {
  if (Array.isArray(value)) {
    return value.map((v) => `${indent}- ` + toYaml(v, indent + '  ').trimStart()).join('\n');
  }
  return Object.entries(value)
    .map(([k, v]) => (typeof v === 'object' ? `${indent}${k}:\n${toYaml(v, indent + '  ')}` : `${indent}${k}: ${JSON.stringify(v)}`))
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Markdown syntax conversions
// ---------------------------------------------------------------------------------------------------------------------

const admonitionTypeMap = { note: 'note', tip: 'tip', info: 'info', warning: 'warning', danger: 'danger', caution: 'warning' };

// Opening lines: ::::note, ::::tip Some Title, ::::warning[Title], ::: caution
const admonitionOpenPattern = /^(\s*):{3,4}\s?(note|tip|info|warning|danger|caution)(?:\s+(.+?)|\[(.*?)\])?\s*$/;
const admonitionClosePattern = /^(\s*):{3,4}\s*$/;

function fixAdmonitions(content) {
  const result = [];
  const stack = [];
  for (const line of content.split('\n')) {
    const open = line.match(admonitionOpenPattern);
    if (open) {
      const [, indent, rawType, title1, title2] = open;
      const type = admonitionTypeMap[rawType];
      const title = title1 || title2 || '';
      result.push(`${indent}{{< ${type}${title ? ` title="${title}"` : ''} >}}`);
      stack.push({ type, indent });
      continue;
    }
    if (admonitionClosePattern.test(line) && stack.length > 0) {
      const { type, indent } = stack.pop();
      result.push(`${indent}{{< /${type} >}}`);
      continue;
    }
    result.push(line);
  }
  return result.join('\n');
}

// Docusaurus: ```js {1,4-6}   Hugo: ```js {hl_lines=[1,"4-6"]}
function fixHighlightLines(content) {
  return content.replace(/^(\s*```[\w+-]*[^\S\n]+.*?)\{([\d\s,-]+)\}/gm, (match, prefix, lines) => {
    const items = lines
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.includes('-') ? `"${s}"` : s));
    return `${prefix}{hl_lines=[${items.join(',')}]}`;
  });
}

function fixTabs(content) {
  return content
    .replace(/^(\s*)<(?:Tabs|BrowserOnlyTabs)(\s[^>]*)?\s*>/gm, (match, indent, attrs) => {
      const groupId = attrs?.match(/groupId="([^"]+)"/)?.[1];
      return `${indent}{{< tabs${groupId ? ` groupId="${groupId}"` : ''} >}}`;
    })
    .replace(/^(\s*)<\/(?:Tabs|BrowserOnlyTabs)>/gm, '$1{{< /tabs >}}')
    .replace(/^(\s*)<TabItem\s+([^>]+)>/gm, (match, indent, attrs) => {
      const value = attrs.match(/value="([^"]+)"/)?.[1] ?? '';
      const label = attrs.match(/label="([^"]+)"/)?.[1] ?? value;
      return `${indent}{{< tab value="${value}" label="${label}" >}}`;
    })
    .replace(/^(\s*)<\/TabItem>/gm, '$1{{< /tab >}}');
}

// Landing page React components (Section, FeatureGrid, Feature) become shortcodes
function fixLandingComponents(content) {
  let changed = false;
  for (const [jsx, shortcode] of Object.entries({ Section: 'section', FeatureGrid: 'feature-grid', Feature: 'feature' })) {
    content = content
      .replace(new RegExp(`^(\\s*)<${jsx}\\b(\\s[^>]*)?>`, 'gm'), (match, indent, attrs) => {
        changed = true;
        return `{{< ${shortcode}${attrs ? attrs.replace(/\{([^}]+)\}/g, '"$1"') : ''} >}}`;
      })
      .replace(new RegExp(`^(\\s*)</${jsx}>`, 'gm'), () => {
        changed = true;
        return `{{< /${shortcode} >}}`;
      });
  }
  if (!changed) {
    return content;
  }
  // Trim leading whitespace inside {{< section >}} blocks
  let inSection = false;
  return content
    .split('\n')
    .map((line) => {
      if (line === '{{< section >}}' || line === '{{< /section >}}') {
        inSection = line === '{{< section >}}';
        return line;
      }
      return inSection ? line.trimStart() : line;
    })
    .join('\n');
}

// Collapse blank lines, trim trailing whitespace (keeping Markdown hard breaks), leave fenced code untouched
function cleanupWhitespace(content) {
  const lines = content.split('\n');
  const result = [];
  let fence;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      result.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && line.trim() === fenceMatch[1]) {
        fence = undefined;
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      result.push(line.trimEnd());
      continue;
    }
    const trimmed = line.trimEnd();
    if (trimmed === '') {
      if (result.length > 0 && result.at(-1) !== '') {
        result.push('');
      }
      continue;
    }
    const isHardBreak = / {2,}$/.test(line) && lines[i + 1] !== undefined && lines[i + 1].trim() !== '';
    result.push(isHardBreak ? trimmed + '  ' : trimmed);
  }
  return result.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

function splitFrontMatter(raw) {
  const match = /^---\n([\s\S]*?\n)?---\n/.exec(raw);
  return match ? { frontMatter: match[0].trimEnd(), body: raw.slice(match[0].length) } : { frontMatter: undefined, body: raw };
}

function getField(frontMatter, key) {
  const value = frontMatter && new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(frontMatter)?.[1]?.trim();
  return value?.replace(/^['"]|['"]$/g, '');
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  if (fs.statSync(dir).isFile()) {
    return [dir];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function removeEmptyDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = path.join(dir, entry.name);
      removeEmptyDirs(sub);
      if (fs.readdirSync(sub).length === 0) {
        fs.rmdirSync(sub);
      }
    }
  }
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
