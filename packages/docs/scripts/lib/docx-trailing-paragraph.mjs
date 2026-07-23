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

  if (/<\/w:tbl>\s*$/.test(before)) {
    return `${before}<w:p/>${after}`;
  }
  return documentXml;
}
