// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import { Operator } from '@medplum/core';

const HEALTH_GORILLA_SYSTEM = 'https://www.healthgorilla.com';

export interface DocumentSourceOption {
  readonly source: 'lab' | 'other';
  readonly label: string;
  readonly headerText: string;
  readonly filters: Filter[];
}

// Each source is identified by marks on the document itself: Health Gorilla stamps its
// identifier on every lab document it writes (reports, specimen labels, requisitions), so
// Other Documents is the complement — anything without a Health Gorilla identifier (a targeted
// :not rather than identifier:missing, so documents with unrelated identifiers still surface
// here).
// Fax/Message sources are not offered yet: nothing links DocumentReferences to their fax or
// chat Communications — the Communication only points at the document via payload.contentReference,
// which is not searchable.
export const DOCUMENT_SOURCE_OPTIONS: DocumentSourceOption[] = [
  {
    source: 'lab',
    label: 'Lab',
    headerText: 'Lab Documents',
    filters: [{ code: 'identifier', operator: Operator.EQUALS, value: `${HEALTH_GORILLA_SYSTEM}|` }],
  },
  {
    source: 'other',
    label: 'Other Documents',
    headerText: 'Other Documents',
    filters: [
      { code: 'identifier', operator: Operator.NOT, value: `${HEALTH_GORILLA_SYSTEM}|` },
      { code: 'related', operator: Operator.MISSING, value: 'true' },
    ],
  },
];

function isSameFilter(a: Filter, b: Filter): boolean {
  return a.code === b.code && a.operator === b.operator && a.value === b.value;
}

/**
 * Returns true if the filter belongs to any document source option.
 * @param filter - The filter to test.
 * @returns True if the filter is one of the document source filters.
 */
export function isDocumentSourceFilter(filter: Filter): boolean {
  return DOCUMENT_SOURCE_OPTIONS.some((option) => option.filters.some((f) => isSameFilter(f, filter)));
}

/**
 * Finds the document source whose filters are all present in the given (URL-parsed) filters.
 * @param filters - The filters parsed from the page URL.
 * @returns The matching document source option, if any.
 */
export function matchDocumentSourceOption(filters: Filter[] | undefined): DocumentSourceOption | undefined {
  return DOCUMENT_SOURCE_OPTIONS.find((option) =>
    option.filters.every((f) => filters?.some((candidate) => isSameFilter(candidate, f)))
  );
}
