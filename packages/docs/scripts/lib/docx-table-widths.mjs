// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Pandoc emits every table with even column widths (derived from the markdown
// delimiter-row dash counts), which squeezes long text columns as badly as
// single-character ones. This rewrites each <w:tblGrid>/<w:tblW> in-place with
// widths sized to each column's actual content, so no word is ever split and
// authors never have to hand-tune source dashes.

const PAGE_WIDTH_TWIPS = 9360; // Letter, 1" margins
const CHAR_WIDTH_TWIPS = 140; // ~avg glyph width at 10-11pt bold header text, in twips
const CELL_PADDING_TWIPS = 320; // ~2 x default cell margin, plus a little slack
const MIN_COL_TWIPS = 450; // absolute floor, only hit for single-glyph columns (#, checkmarks)
const MAX_COL_TWIPS = 5760; // 4", so one column can't swallow the whole table

function stripTags(xml) {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function longestWordLength(text) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.reduce((max, w) => Math.max(max, w.length), 0);
}

function columnWidths(headerCells, bodyCellsByColumn) {
  const n = headerCells.length;
  const stats = headerCells.map((headerText, i) => {
    const cellsInColumn = [headerText, ...(bodyCellsByColumn[i] ?? [])];
    const maxLen = Math.max(...cellsInColumn.map((t) => t.length), 1);
    const maxWord = Math.max(...cellsInColumn.map(longestWordLength), 1);
    return { maxLen, maxWord };
  });

  // Every column's hard floor: whatever it takes to hold its own longest word
  // on one line. This must never be violated, even when columns are shrunk
  // to fit the page — that's exactly the invariant "no word gets split" means.
  const minWidths = stats.map(({ maxWord }) => Math.max(MIN_COL_TWIPS, maxWord * CHAR_WIDTH_TWIPS + CELL_PADDING_TWIPS));

  // Desired width: fit the typical (not longest-ever) content on ~1-2 lines.
  const desired = stats.map(({ maxLen }, i) =>
    Math.min(MAX_COL_TWIPS, Math.max(minWidths[i], Math.min(maxLen, 40) * CHAR_WIDTH_TWIPS + CELL_PADDING_TWIPS))
  );

  const totalDesired = desired.reduce((a, b) => a + b, 0);

  let widths;
  if (totalDesired <= PAGE_WIDTH_TWIPS) {
    // Room to spare: grow every column proportionally to fill the page.
    // Growing can never violate a minimum, so this is always safe.
    const extra = PAGE_WIDTH_TWIPS - totalDesired;
    widths = desired.map((w) => w + (extra * w) / totalDesired);
  } else {
    // Too tight: shrink, but only ever eat into each column's slack above its
    // own minimum — proportionally, so wide columns give up more than narrow
    // ones — never below the minimum itself.
    const slack = desired.map((w, i) => w - minWidths[i]);
    const totalSlack = slack.reduce((a, b) => a + b, 0);
    const deficit = totalDesired - PAGE_WIDTH_TWIPS;
    if (totalSlack > 0 && deficit <= totalSlack) {
      widths = desired.map((w, i) => w - slack[i] * (deficit / totalSlack));
    } else {
      // Pathological case: even every column at its bare minimum doesn't fit
      // (e.g. far too many columns for the page). Degrade gracefully rather
      // than throw — scale minimums down uniformly instead of crashing.
      const totalMin = minWidths.reduce((a, b) => a + b, 0);
      const scale = totalMin > 0 ? PAGE_WIDTH_TWIPS / totalMin : 1;
      widths = minWidths.map((w) => w * scale);
    }
  }

  widths = widths.map((w) => Math.round(w));

  // Reconcile rounding drift against the exact page width on the last column.
  const drift = PAGE_WIDTH_TWIPS - widths.reduce((a, b) => a + b, 0);
  widths[n - 1] += drift;

  return widths;
}

function parseTable(tblXml) {
  const rowMatches = [...tblXml.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)];
  if (rowMatches.length === 0) return null;

  const rows = rowMatches.map((rowMatch) => {
    const cellMatches = [...rowMatch[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)];
    return cellMatches.map((cellMatch) => stripTags(cellMatch[1]));
  });

  const headerCells = rows[0];
  const n = headerCells.length;
  const bodyCellsByColumn = Array.from({ length: n }, (_, col) => rows.slice(1).map((r) => r[col] ?? ''));

  return columnWidths(headerCells, bodyCellsByColumn);
}

function replaceGrid(tblXml, widths) {
  const newGrid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  let out = tblXml.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, newGrid);

  // Force the fixed page width and fixed layout so Word honors our widths
  // instead of re-deriving them from cell content.
  if (/<w:tblW\b/.test(out)) {
    out = out.replace(/<w:tblW\b[^/]*\/>/, `<w:tblW w:w="${PAGE_WIDTH_TWIPS}" w:type="dxa"/>`);
  } else {
    out = out.replace(/(<w:tblPr>)/, `$1<w:tblW w:w="${PAGE_WIDTH_TWIPS}" w:type="dxa"/>`);
  }
  if (/<w:tblLayout\b/.test(out)) {
    out = out.replace(/<w:tblLayout\b[^/]*\/>/, '<w:tblLayout w:type="fixed"/>');
  } else {
    out = out.replace(/(<\/w:tblPr>)/, `<w:tblLayout w:type="fixed"/>$1`);
  }

  // Also stamp explicit per-cell widths (<w:tcW>) so cells match the grid even
  // if a viewer ignores <w:tblGrid>.
  let col = 0;
  const cellCountInFirstRow = (out.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/)?.[0].match(/<w:tc\b/g) ?? []).length;
  out = out.replace(/<w:tcW\b[^/]*\/>/g, () => {
    const w = widths[col % widths.length];
    col += 1;
    return `<w:tcW w:w="${w}" w:type="dxa"/>`;
  });
  void cellCountInFirstRow;

  return out;
}

export function fixTableWidths(documentXml) {
  return documentXml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tblXml) => {
    const widths = parseTable(tblXml);
    if (!widths) return tblXml;
    return replaceGrid(tblXml, widths);
  });
}
