// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

const DIACRITICS = /\p{Diacritic}/gu;

/**
 * Folds text for case- and diacritic-insensitive comparison: NFD-decompose, drop the combining marks, lowercase.
 *
 * This covers every diacritic with a canonical decomposition, but not characters that Postgres's `unaccent`
 * transliterates without one (ø, æ, ß, ł), so it is not exactly equivalent to the `medplum_unaccent` SQL function.
 * @param value - The raw string.
 * @returns The string lowercased with diacritics removed.
 */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}
