// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Pandoc emits every table with even column widths (derived from the markdown
// delimiter-row dash counts), which squeezes long text columns as badly as
// single-character ones. This rewrites each <w:tblGrid>/<w:tblW> in-place with
// widths sized to each column's actual content, so no word is ever split and
// authors never have to hand-tune source dashes.

const PAGE_WIDTH_TWIPS = 9360; // Letter, 1" margins
const CHARS_PER_TWIP_INVERSE = 105; // ~avg Poppins char width at 10pt body text, in twips
const CELL_PADDING_TWIPS = 260; // ~2 x default cell margin
const MIN_COL_TWIPS = 450; // floor so single-glyph columns (#, checkmarks) stay usable
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

  // Desired width: fit the typical (not longest-ever) content on ~1-2 lines.
  const desired = stats.map(({ maxLen, maxWord }) => {
    const contentWidth = Math.min(maxLen, 40) * CHARS_PER_TWIP_INVERSE + CELL_PADDING_TWIPS;
    const minForLongestWord = maxWord * CHARS_PER_TWIP_INVERSE + CELL_PADDING_TWIPS;
    return Math.min(MAX_COL_TWIPS, Math.max(MIN_COL_TWIPS, contentWidth, minForLongestWord));
  });

  const total = desired.reduce((a, b) => a + b, 0);
  const scale = PAGE_WIDTH_TWIPS / total;

  // Scale to fill the page width, but never scale a column below its minimum.
  let widths = desired.map((w) => Math.round(w * scale));
  widths = widths.map((w, i) => Math.max(w, MIN_COL_TWIPS));

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
