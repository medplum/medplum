// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId } from '@medplum/core';

export const HYPOPG_ACCESS_METHODS = ['btree', 'brin', 'hash', 'bloom'] as const;

export type HypopgAccessMethod = (typeof HYPOPG_ACCESS_METHODS)[number];

const UNIQUE_ACCESS_METHODS = new Set<HypopgAccessMethod>(['btree', 'hash']);

export interface HypotheticalIndexDraft {
  readonly id: string;
  readonly tableName: string;
  readonly columns: readonly string[];
  readonly accessMethod: HypopgAccessMethod;
  readonly unique: boolean;
}

export function createHypotheticalIndexDraft(): HypotheticalIndexDraft {
  return {
    id: generateId(),
    tableName: '',
    columns: [],
    accessMethod: 'btree',
    unique: false,
  };
}

export function supportsUnique(accessMethod: HypopgAccessMethod): boolean {
  return UNIQUE_ACCESS_METHODS.has(accessMethod);
}

function isBlankDraft(draft: HypotheticalIndexDraft): boolean {
  return !draft.tableName && draft.columns.length === 0 && !draft.unique && draft.accessMethod === 'btree';
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function hypotheticalIndexStatement(draft: HypotheticalIndexDraft): string | undefined {
  if (!draft.tableName || draft.columns.length === 0) {
    return undefined;
  }
  const unique = supportsUnique(draft.accessMethod) && draft.unique ? 'UNIQUE ' : '';
  const columns = draft.columns.map(quoteIdentifier).join(', ');
  return `CREATE ${unique}INDEX ON ${quoteIdentifier(draft.tableName)} USING ${draft.accessMethod} (${columns})`;
}

export function buildHypotheticalIndexSql(drafts: readonly HypotheticalIndexDraft[]): {
  sql?: string;
  error?: string;
} {
  const statements: string[] = [];
  for (const draft of drafts) {
    if (isBlankDraft(draft)) {
      continue;
    }
    const statement = hypotheticalIndexStatement(draft);
    if (!statement) {
      return { error: 'Each hypothetical index needs a table and at least one column' };
    }
    statements.push(statement);
  }
  if (statements.length === 0) {
    return {};
  }
  return { sql: statements.join('; ') };
}
