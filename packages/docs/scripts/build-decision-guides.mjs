#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Regenerates the Decision Guide downloads from their canonical Markdown:
//   docs/decision-guides/<slug>.md
//     --pandoc-->  static/decision-guides/<slug>.docx   (editable)
//     --soffice--> static/decision-guides/<slug>.pdf     (brand-fidelity, all viewers)
//
// The PDF is rendered from the finished .docx, so the two can never drift.
// Run via `npm run build` / `npm start` (wired as prebuild/prestart).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixTableWidths } from './lib/docx-table-widths.mjs';
import { ensureTrailingParagraph } from './lib/docx-trailing-paragraph.mjs';
import { preventRowSplitting } from './lib/docx-row-split.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, '..', 'docs', 'decision-guides');
const OUT_DIR = path.join(__dirname, '..', 'static', 'decision-guides');
const REFERENCE_DOCX = path.join(__dirname, 'decision-guide-reference.docx');
const WORDMARK_PNG = path.join(__dirname, 'assets', 'medplum-wordmark-grape.png');

function stripFrontMatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function sh(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

// Some build environments (e.g. Vercel's sandbox, which has no root/apt-get)
// don't have pandoc/LibreOffice installed and never will. Missing tools
// there should degrade to "no downloads this build," not fail the whole
// docs build — the docs site itself doesn't depend on these files existing.
// A tool that IS present but fails for some other reason (bad markdown, a
// real pandoc/LibreOffice error) should still fail loudly.
function isMissingToolError(err) {
  return err.code === 'ENOENT';
}

function buildDocx(slug, markdownBody, tmpDir) {
  const tmpMd = path.join(tmpDir, `${slug}.md`);
  const content = `![Medplum](${WORDMARK_PNG})\n\n${markdownBody}`;
  fs.writeFileSync(tmpMd, content);

  const outDocx = path.join(OUT_DIR, `${slug}.docx`);
  sh('pandoc', [tmpMd, '--from=markdown-implicit_figures', `--reference-doc=${REFERENCE_DOCX}`, '-o', outDocx]);
  return outDocx;
}

function postProcessDocx(docxPath) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-guide-docx-'));
  sh('unzip', ['-q', '-o', docxPath, '-d', extractDir]);

  const documentXmlPath = path.join(extractDir, 'word', 'document.xml');
  let xml = fs.readFileSync(documentXmlPath, 'utf8');
  xml = fixTableWidths(xml);
  xml = preventRowSplitting(xml);
  xml = ensureTrailingParagraph(xml);
  fs.writeFileSync(documentXmlPath, xml);

  fs.rmSync(docxPath);
  // Re-zip from inside extractDir so paths in the archive stay relative.
  execFileSync('zip', ['-q', '-r', docxPath, '.'], { cwd: extractDir, stdio: 'inherit' });
  fs.rmSync(extractDir, { recursive: true, force: true });
}

function buildPdf(docxPath, slug) {
  try {
    sh('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT_DIR, docxPath]);
  } catch (err) {
    if (!isMissingToolError(err)) throw err;
    console.warn(
      `[build-decision-guides] Skipping PDF for "${slug}" — LibreOffice ("soffice") is not available in this environment.\n` +
        `  The .docx download still built. Production CI installs LibreOffice, so the PDF is generated there.`
    );
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const slugs = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => f.replace(/\.md$/, ''));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-guide-md-'));
  let built = 0;
  for (const slug of slugs) {
    const raw = fs.readFileSync(path.join(DOCS_DIR, `${slug}.md`), 'utf8');
    const body = stripFrontMatter(raw);

    let docxPath;
    try {
      console.log(`[build-decision-guides] ${slug}: markdown -> docx`);
      docxPath = buildDocx(slug, body, tmpDir);

      console.log(`[build-decision-guides] ${slug}: applying table widths + layout fixes`);
      postProcessDocx(docxPath);
    } catch (err) {
      if (!isMissingToolError(err)) throw err;
      console.warn(
        `[build-decision-guides] Skipping "${slug}" — pandoc/unzip/zip is not available in this environment.\n` +
          `  The docs page itself is unaffected; only the .docx/.pdf downloads are skipped this build.\n` +
          `  Production CI installs these tools, so the downloads are generated there.`
      );
      continue;
    }

    console.log(`[build-decision-guides] ${slug}: docx -> pdf`);
    buildPdf(docxPath, slug);
    built += 1;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`[build-decision-guides] Done — ${built}/${slugs.length} guide(s) built to ${OUT_DIR}`);
}

main();
