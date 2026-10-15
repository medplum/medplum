#!/usr/bin/env node

/**
 * Post-process Hugo output to replace <pre class="mermaid"> blocks with static SVGs,
 * so the site never runs mermaid on the client.
 *
 * Renders every diagram in a single headless Chromium session, once per site theme.
 * Diagrams that pin their own theme (%%{init: {'theme': ...}}%%) render identically
 * in both, so they get a single SVG.
 *
 * Usage:
 *   hugo --minify
 *   node postprocess-mermaid.mjs [--public-dir=public]
 *
 * Requires a Playwright Chromium: npx playwright install chromium
 */

import { createHash } from 'node:crypto';
import { glob, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLIC_DIR = process.argv.find((a) => a.startsWith('--public-dir='))?.split('=')[1] ?? 'public';

const MERMAID_JS = fileURLToPath(import.meta.resolve('mermaid/dist/mermaid.min.js'));

// Hugo's minifier strips the attribute quotes
const MERMAID_RE = /<pre class=mermaid>\s*([\s\S]*?)\s*<\/pre>/g;

// Mermaid theme for each site theme
const THEMES = { light: 'default', dark: 'dark' };

function decodeHtmlEntities(str) {
  // Go's html escaping emits numeric entities (&#34; &#39;), so decode those generically
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function hashSource(source) {
  return createHash('sha256').update(source).digest('hex').slice(0, 12);
}

/**
 * Renders each diagram once per site theme.
 * @param {Map<string, string>} sources - Map from source hash to mermaid source.
 * @returns {Promise<Record<string, Record<string, string> & { error?: string }>>} Map from source hash to SVG per site theme.
 */
async function renderAll(sources) {
  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: MERMAID_JS });
    return await page.evaluate(
      async ({ entries, themes }) => {
        const out = {};
        for (const [siteTheme, mermaidTheme] of Object.entries(themes)) {
          window.mermaid.initialize({ startOnLoad: false, theme: mermaidTheme });
          for (const [hash, source] of entries) {
            const result = (out[hash] ??= {});
            try {
              // Unique id per theme: each SVG's <style> is scoped by its id
              result[siteTheme] = (await window.mermaid.render(`mermaid-${hash}-${siteTheme}`, source)).svg;
            } catch (err) {
              result.error = String(err?.message ?? err);
            }
          }
        }
        return out;
      },
      { entries: [...sources], themes: THEMES }
    );
  } finally {
    await browser.close();
  }
}

function buildReplacement(hash, rendered, occurrence) {
  // A diagram repeated on one page needs distinct ids too
  const uniquify = (svg) => (occurrence === 0 ? svg : svg.replaceAll(`mermaid-${hash}-`, `mermaid-${hash}-${occurrence}-`));
  const { light, dark } = rendered;
  if (light.replaceAll(`mermaid-${hash}-light`, '') === dark.replaceAll(`mermaid-${hash}-dark`, '')) {
    return `<div class=mermaid-diagram>${uniquify(light)}</div>`;
  }
  return `<div class=mermaid-diagram><div class=mermaid-light>${uniquify(light)}</div><div class=mermaid-dark>${uniquify(dark)}</div></div>`;
}

async function main() {
  const start = Date.now();

  const pages = new Map();
  const sources = new Map();
  for await (const filePath of glob(`${PUBLIC_DIR}/**/*.html`)) {
    const html = await readFile(filePath, 'utf-8');
    if (!html.includes('<pre class=mermaid>')) {
      continue;
    }
    pages.set(filePath, html);
    for (const match of html.matchAll(MERMAID_RE)) {
      const source = decodeHtmlEntities(match[1]);
      sources.set(hashSource(source), source);
    }
  }

  if (sources.size === 0) {
    console.log('No Mermaid diagrams found.');
    return;
  }

  const rendered = await renderAll(sources);

  const failures = [];
  let diagrams = 0;
  for (const [filePath, html] of pages) {
    const occurrences = {};
    const result = html.replace(MERMAID_RE, (block, body) => {
      const hash = hashSource(decodeHtmlEntities(body));
      const r = rendered[hash];
      if (r.error) {
        failures.push(`${filePath}: ${r.error}`);
        return block;
      }
      diagrams++;
      const occurrence = occurrences[hash] ?? 0;
      occurrences[hash] = occurrence + 1;
      return buildReplacement(hash, r, occurrence);
    });
    await writeFile(filePath, result, 'utf-8');
  }

  if (failures.length > 0) {
    console.error(`Failed to render ${failures.length} Mermaid diagram(s):\n`);
    for (const failure of failures) {
      console.error(`${failure}\n`);
    }
    process.exit(1);
  }

  console.log(`Rendered ${diagrams} Mermaid diagrams in ${pages.size} pages to static SVG (${Date.now() - start} ms).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
