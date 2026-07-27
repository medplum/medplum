#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Regenerates the Decision Guide downloads from their canonical Markdown:
//   docs/decision-guides/<slug>.md
//     --pandoc-->  static/decision-guides/<slug>.docx   (editable)
//     --soffice--> static/decision-guides/<slug>.pdf     (brand-fidelity, all viewers)
//
// The PDF is rendered from the finished .docx, so the two can never drift.
//
// Run via `npm run build:guides`. This is deliberately NOT a build hook: the
// production docs site is built and served by Vercel, whose sandbox has no
// root/apt-get and so can never have pandoc/LibreOffice. The generated files are
// therefore committed to the repo, and CI regenerates them whenever a guide's
// markdown changes (.github/workflows/autofix-ci.yml) — so a Vercel build just
// serves what's already checked in, and never runs this script. Output is
// byte-reproducible (see lib/docx-reproducible.mjs) so regenerating unchanged
// content is a no-op rather than a fresh binary blob in git.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeCoreProps,
  normalizePdfMetadata,
  setFixedMtimes,
  sortedArchiveEntries,
  SOURCE_DATE_EPOCH,
  stripImageSourcePaths,
} from './lib/docx-reproducible.mjs';
import { preventRowSplitting } from './lib/docx-row-split.mjs';
import { fixTableWidths } from './lib/docx-table-widths.mjs';
import { ensureTrailingParagraph } from './lib/docx-trailing-paragraph.mjs';

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

// Now that this script only runs where the tools are expected (CI regeneration,
// or a contributor running it by hand), a missing tool is no longer load-bearing
// for any deploy — but it's still nicer to report "install pandoc" than to dump
// a spawn ENOENT stack, so keep degrading gracefully. A tool that IS present but
// fails for some other reason (bad markdown, a real pandoc/LibreOffice error)
// should still fail loudly.
function isMissingToolError(err) {
  return err.code === 'ENOENT';
}

// Builds into tmpDir rather than OUT_DIR: a docx is only worth publishing once
// post-processing has run, so an interrupted build (e.g. zip/unzip missing after
// pandoc succeeded) can't leave a raw even-columns docx sitting in static/.
function buildDocx(slug, markdownBody, tmpDir) {
  const tmpMd = path.join(tmpDir, `${slug}.md`);
  const content = `![Medplum](${WORDMARK_PNG})\n\n${markdownBody}`;
  fs.writeFileSync(tmpMd, content);

  const tmpDocx = path.join(tmpDir, `${slug}.docx`);
  sh('pandoc', [tmpMd, '--from=markdown-implicit_figures', `--reference-doc=${REFERENCE_DOCX}`, '-o', tmpDocx]);
  return tmpDocx;
}

function postProcessDocx(docxPath) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-guide-docx-'));
  sh('unzip', ['-q', '-o', docxPath, '-d', extractDir]);

  const documentXmlPath = path.join(extractDir, 'word', 'document.xml');
  let xml = fs.readFileSync(documentXmlPath, 'utf8');
  xml = fixTableWidths(xml);
  xml = preventRowSplitting(xml);
  xml = ensureTrailingParagraph(xml);
  xml = stripImageSourcePaths(xml);
  fs.writeFileSync(documentXmlPath, xml);

  const corePropsPath = path.join(extractDir, 'docProps', 'core.xml');
  if (fs.existsSync(corePropsPath)) {
    fs.writeFileSync(corePropsPath, normalizeCoreProps(fs.readFileSync(corePropsPath, 'utf8')));
  }

  fs.rmSync(docxPath);
  // Re-zip from inside extractDir so paths in the archive stay relative, with a
  // fixed date and an explicit sorted member list so the bytes are reproducible
  // (see docx-reproducible.mjs). -X drops platform extra-attribute blocks; the
  // sorted list omits directory entries, which a .docx doesn't need.
  setFixedMtimes(extractDir);
  execFileSync('zip', ['-q', '-X', '-D', docxPath, ...sortedArchiveEntries(extractDir)], {
    cwd: extractDir,
    stdio: 'inherit',
  });
  fs.rmSync(extractDir, { recursive: true, force: true });
}

function buildPdf(docxPath, slug) {
  try {
    // Pass SOURCE_DATE_EPOCH, which LibreOffice is documented to honor...
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT_DIR, docxPath], {
      stdio: 'inherit',
      env: { ...process.env, SOURCE_DATE_EPOCH: String(SOURCE_DATE_EPOCH) },
    });

    // ...and normalize the timestamp afterwards, because it doesn't honor it.
    const pdfPath = path.join(OUT_DIR, `${slug}.pdf`);
    fs.writeFileSync(pdfPath, normalizePdfMetadata(fs.readFileSync(pdfPath)));
  } catch (err) {
    if (!isMissingToolError(err)) throw err;
    console.warn(
      `[build-decision-guides] Skipping PDF for "${slug}" — LibreOffice ("soffice") is not available here.\n` +
        `  The .docx was still regenerated. Install LibreOffice to regenerate PDFs locally, or let\n` +
        `  CI regenerate both formats on your PR (.github/workflows/autofix-ci.yml).`
    );
  }
}

// Removes downloads for guides that no longer exist, so a renamed or deleted
// .md doesn't leave an orphan checked in that nothing links to. Targeted rather
// than wiping OUT_DIR wholesale: these files are committed now, so a run without
// pandoc installed must leave the existing ones untouched instead of deleting
// downloads it can't rebuild.
function pruneOrphans(slugs) {
  const expected = new Set(slugs.flatMap((slug) => [`${slug}.docx`, `${slug}.pdf`]));
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (!expected.has(file)) {
      console.log(`[build-decision-guides] removing orphaned ${file} (no matching guide)`);
      fs.rmSync(path.join(OUT_DIR, file));
    }
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

    const outDocx = path.join(OUT_DIR, `${slug}.docx`);
    try {
      console.log(`[build-decision-guides] ${slug}: markdown -> docx`);
      const tmpDocx = buildDocx(slug, body, tmpDir);

      console.log(`[build-decision-guides] ${slug}: applying table widths + layout fixes`);
      postProcessDocx(tmpDocx);

      // Only now is it a finished download — publish it.
      fs.renameSync(tmpDocx, outDocx);
    } catch (err) {
      if (!isMissingToolError(err)) throw err;
      console.warn(
        `[build-decision-guides] Skipping "${slug}" — pandoc/unzip/zip is not available here.\n` +
          `  Its committed downloads are left as they are, so nothing breaks; they just weren't refreshed.\n` +
          `  Install pandoc + zip/unzip to regenerate locally, or let CI do it on your PR.`
      );
      continue;
    }

    console.log(`[build-decision-guides] ${slug}: docx -> pdf`);
    buildPdf(outDocx, slug);
    built += 1;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  pruneOrphans(slugs);

  console.log(`[build-decision-guides] Done — ${built}/${slugs.length} guide(s) built to ${OUT_DIR}`);
}

main();
