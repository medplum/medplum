import { stringify } from '@medplum/core';
import { Bundle, BundleEntry, Meta } from '@medplum/fhirtypes';
import { diff } from './diff';

export interface BlameRow {
  id: string;
  meta: Meta;
  value: string;
  span: number;
}

export function blame(history: Bundle): BlameRow[] {
  // Convert to array of array of lines
  const versions = (history.entry as BundleEntry[])
    .filter((entry) => !!entry.resource)
    .map((entry) => ({
      meta: entry.resource?.meta as Meta,
      lines: stringify(entry.resource, true).match(/[^\r\n]+/g) as string[],
    }))
    .sort((a, b) => (a.meta.lastUpdated as string).localeCompare(b.meta.lastUpdated as string));

  // Start with array of lines from the first version
  const table: BlameRow[] = versions[0].lines.map((line) => ({
    id: versions[0].meta.versionId as string,
    meta: versions[0].meta,
    value: line,
    span: 1,
  }));

  compareVersions(table, versions);
  combineSpans(table);
  return table;
}

/**
 * For each version, update the blame table with revisions.
 * @param table - The output blame table.
 * @param versions - The array of versions.
 */
function compareVersions(table: BlameRow[], versions: { meta: Meta; lines: string[] }[]): void {
  for (let i = 1; i < versions.length; i++) {
    const revisions = diff(versions[i - 1].lines, versions[i].lines);

    for (const revision of revisions) {
      const position = revision.original.position;
      const oldLines = revision.original.lines;
      const newLines = revision.revised.lines;

      if (revision.type === 'delete' || revision.type === 'change') {
        // Remove the old rows
        table.splice(position, oldLines.length);
      }

      if (revision.type === 'insert' || revision.type === 'change') {
        // Add the new lines
        for (let k = 0; k < revision.revised.lines.length; k++) {
          table.splice(position + k, 0, {
            id: versions[i].meta.versionId as string,
            meta: versions[i].meta,
            value: newLines[k],
            span: 1,
          });
        }
      }
    }
  }
}

/**
 * Combine adjacent rows into spans.
 * @param table - The output blame table.
 */
function combineSpans(table: BlameRow[]): void {
  let start = 0;
  while (start < table.length) {
    let curr = start;
    while (curr < table.length && table[curr].id === table[start].id) {
      table[curr].span = -1;
      curr++;
    }
    table[start].span = curr - start;
    start = curr;
  }
}
