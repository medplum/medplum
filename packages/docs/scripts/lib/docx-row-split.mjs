// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Word/LibreOffice allow a table row to break across a page by default,
// which can orphan a cell's tail end on the next page with no repeated
// header for context. Marking every row <w:cantSplit/> forces a whole row
// to move to the next page instead.
export function preventRowSplitting(documentXml) {
  return documentXml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tblXml) =>
    tblXml.replace(/(<w:tr\b[^>]*>)(\s*<w:trPr>)?/g, (_match, trOpen, trPrOpen) => {
      if (trPrOpen) {
        return `${trOpen}${trPrOpen}<w:cantSplit/>`;
      }
      return `${trOpen}<w:trPr><w:cantSplit/></w:trPr>`;
    })
  );
}
