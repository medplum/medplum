// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ConceptMap, ConceptMapGroupElement, ConceptMapGroupElementTarget } from '@medplum/fhirtypes';

/**
 * The FHIR R4 equivalence value set (ConceptMapEquivalence). All ten values are supported
 * for round-trip fidelity; the common subset is surfaced above the divider in the Select.
 */
export type Equivalence = ConceptMapGroupElementTarget['equivalence'];

export const EQUIVALENCE_OPTIONS = [
  {
    group: 'Common',
    items: [
      { value: 'equivalent', label: 'equivalent — same meaning' },
      { value: 'wider', label: 'wider — target is more general' },
      { value: 'narrower', label: 'narrower — target is more specific' },
      { value: 'inexact', label: 'inexact — related, not exact' },
      { value: 'unmatched', label: 'unmatched — no equivalent' },
    ],
  },
  {
    group: 'Precise / rare',
    items: [
      { value: 'relatedto', label: 'relatedto' },
      { value: 'equal', label: 'equal' },
      { value: 'subsumes', label: 'subsumes' },
      { value: 'specializes', label: 'specializes' },
      { value: 'disjoint', label: 'disjoint' },
    ],
  },
];

/**
 * Equivalences that FHIR invariant `cmd-1` requires a comment for: "If the map is narrower or
 * inexact, there SHALL be some comments". The server rejects the save without one, so the
 * builder enforces it up front rather than surfacing a raw constraint error.
 */
export const COMMENT_REQUIRED: readonly Equivalence[] = ['narrower', 'inexact'];

/**
 * Hard read-only backstop: above this many elements the visual builder can't be safely
 * edited row-by-row, so it falls back to the read-only mappings table.
 */
export const EDIT_LIMIT = 10_000;

export type ElementFilter = 'all' | 'mapped' | 'unmapped' | 'nomap';

// A "no-map" row is a single target with equivalence `unmatched` and no code — the R4 way to
// record "reviewed, no equivalent". Distinct from a not-yet-mapped (empty) row.
export function isNoMap(element: ConceptMapGroupElement): boolean {
  const targets = element.target;
  return targets?.length === 1 && targets[0].equivalence === 'unmatched' && !targets[0].code;
}

export function matchesFilter(element: ConceptMapGroupElement, filter: ElementFilter): boolean {
  switch (filter) {
    case 'mapped':
      // "Mapped" means a real coded target, so no-map rows are excluded here and surfaced
      // under the dedicated No-map filter instead.
      return Boolean(element.target?.some((t) => t.code));
    case 'unmapped':
      return !element.target || element.target.length === 0;
    case 'nomap':
      return isNoMap(element);
    default:
      return true;
  }
}

// Substring match over the source code/display and every target's code, display, and comment.
// Runs against the full element array, before any render cap, so search finds rows that
// find-in-page cannot reach.
export function matchesSearch(element: ConceptMapGroupElement, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }
  if (element.code?.toLowerCase().includes(query) || element.display?.toLowerCase().includes(query)) {
    return true;
  }
  return (element.target ?? []).some(
    (t) =>
      t.code?.toLowerCase().includes(query) ||
      t.display?.toLowerCase().includes(query) ||
      t.comment?.toLowerCase().includes(query)
  );
}

export function countElements(conceptMap: ConceptMap): number {
  return (conceptMap.group ?? []).reduce((sum, group) => sum + (group.element?.length ?? 0), 0);
}

export function equivalenceColor(equivalence: Equivalence | undefined): string {
  switch (equivalence) {
    case 'equivalent':
    case 'equal':
      return 'green';
    case 'wider':
    case 'narrower':
    case 'subsumes':
    case 'specializes':
      return 'blue';
    case 'inexact':
    case 'relatedto':
      return 'yellow';
    case 'unmatched':
    case 'disjoint':
      return 'gray';
    default:
      return 'red';
  }
}
