#!/usr/bin/env node

/**
 * Post-process Hugo output to replace <pre class="mermaid"> blocks
 * with static SVGs rendered by mermaid-cli (mmdc).
 *
 * Usage:
 *   hugo build
 *   node postprocess-mermaid.mjs [--public-dir=public]
 *
 * Requires: npm install -D @mermaid-js/mermaid-cli
 */

import { execFile } from 'node:child_process';
import { glob, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PUBLIC_DIR = process.argv.find((a) => a.startsWith('--public-dir='))?.split('=')[1] ?? 'public';

const MMDC_BIN = process.argv.find((a) => a.startsWith('--mmdc='))?.split('=')[1] ?? 'node_modules/.bin/mmdc';

// Match <pre class="mermaid">...</pre> blocks
// Using [\s\S] instead of . to match across newlines
const MERMAID_RE = /<pre class=mermaid>\s*([\s\S]*?)\s*<\/pre>/g;

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'");
}

async function renderMermaidToSvg(mermaidSource, tmpDir, index) {
  const inputPath = join(tmpDir, `diagram-${index}.mmd`);
  const outputPath = join(tmpDir, `diagram-${index}.svg`);

  await writeFile(inputPath, mermaidSource, 'utf-8');

  await execFileAsync(MMDC_BIN, ['-i', inputPath, '-o', outputPath, '-b', 'transparent', '--quiet']);

  const svg = await readFile(outputPath, 'utf-8');

  // Strip any <?xml ...?> declaration and wrapping metadata mmdc adds
  return svg.replace(/<\?xml[^?]*\?>\s*/g, '').trim();
}

async function processFile(filePath, tmpDir, stats) {
  const html = await readFile(filePath, 'utf-8');
  const matches = [...html.matchAll(MERMAID_RE)];

  if (matches.length === 0) return;

  let result = html;
  let diagramIndex = 0;

  for (const match of matches) {
    const fullMatch = match[0];
    const mermaidSource = decodeHtmlEntities(match[1].trim());

    try {
      const svg = await renderMermaidToSvg(mermaidSource, tmpDir, `${stats.fileIndex}-${diagramIndex}`);

      // Wrap in a div for styling control
      const replacement = `<div class="mermaid-diagram">${svg}</div>`;
      result = result.replace(fullMatch, replacement);

      stats.diagrams++;
      diagramIndex++;
    } catch (err) {
      console.error(`  ⚠ Failed to render diagram in ${filePath}:`, err.message);
      // Leave the original block in place on failure
    }
  }

  if (diagramIndex > 0) {
    await writeFile(filePath, result, 'utf-8');
    stats.files++;
    console.log(`  ✓ ${filePath} (${diagramIndex} diagram${diagramIndex > 1 ? 's' : ''})`);
  }
}

async function main() {
  console.log(`\nPost-processing Mermaid diagrams in ./${PUBLIC_DIR}/\n`);

  const tmpDir = await mkdtemp(join(tmpdir(), 'mermaid-'));
  const stats = { files: 0, diagrams: 0, fileIndex: 0 };

  try {
    const htmlFiles = glob(`${PUBLIC_DIR}/**/*.html`);

    for await (const filePath of htmlFiles) {
      stats.fileIndex++;
      await processFile(filePath, tmpDir, stats);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  console.log(
    `\nDone: ${stats.diagrams} diagram${stats.diagrams !== 1 ? 's' : ''} ` + `in ${stats.files} file${stats.files !== 1 ? 's' : ''} converted to static SVG.\n`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
