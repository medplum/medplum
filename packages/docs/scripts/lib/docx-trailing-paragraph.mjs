// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// When a document's last block is a table, Word auto-inserts a stray bullet
// paragraph right after it on open. Appending an empty paragraph ourselves
// (matching pandoc's own convention between blocks) preempts that.
export function ensureTrailingParagraph(documentXml) {
  const bodyEndIndex = documentXml.lastIndexOf('<w:sectPr');
  if (bodyEndIndex === -1) return documentXml;

  const before = documentXml.slice(0, bodyEndIndex);
  const after = documentXml.slice(bodyEndIndex);

  // pandoc closes out the body with the section's <w:bookmarkEnd/> markers (one
  // per heading anchor) between the last block and <w:sectPr>, so testing for a
  // table immediately before <w:sectPr> never matched. Ignore those markers and
  // whitespace when deciding whether the last real block is a table.
  const lastBlock = before.replace(/(?:\s|<w:bookmarkEnd\b[^>]*\/>)+$/, '');

  if (/<\/w:tbl>$/.test(lastBlock)) {
    return `${before}<w:p/>${after}`;
  }
  return documentXml;
}
