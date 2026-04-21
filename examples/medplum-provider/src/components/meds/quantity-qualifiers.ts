// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * NCI Thesaurus potency-unit codes used by DAW/ScriptSure as quantity qualifiers
 * (`potencyUnit` from GET /v3/prescription/quantityqualifier).
 *
 * This static table is a fallback when the live catalog has not been loaded yet.
 * @see https://github.com/... (DAW docs: get-quantity-qualifiers)
 */
export const STATIC_QUANTITY_QUALIFIERS: readonly { readonly code: string; readonly label: string }[] = [
  { code: 'C48473', label: 'Ampule' },
  { code: 'C62412', label: 'Applicator' },
  { code: 'C78783', label: 'Applicatorful' },
  { code: 'C48474', label: 'Bag' },
  { code: 'C48475', label: 'Bar' },
  { code: 'C48480', label: 'Each' },
  { code: 'C25301', label: 'Day' },
  { code: 'C28254', label: 'Milliliter' },
  { code: 'C48542', label: 'Tablet dosing unit' },
  { code: 'C48477', label: 'Drop' },
  { code: 'C48478', label: 'Gram' },
  { code: 'C48479', label: 'International unit' },
  { code: 'C48481', label: 'Milligram' },
  { code: 'C48482', label: 'Microgram' },
  { code: 'C48483', label: 'Capsule' },
  { code: 'C48484', label: 'Patch' },
  { code: 'C48485', label: 'Spray' },
  { code: 'C48486', label: 'Suppository' },
  { code: 'C48487', label: 'Syringe' },
  { code: 'C48488', label: 'Vial' },
];

const STATIC_BY_CODE: Readonly<Record<string, string>> = Object.fromEntries(
  STATIC_QUANTITY_QUALIFIERS.map((e) => [e.code, e.label])
);

/**
 * Human-readable label for a DAW quantity-qualifier / NCI potency-unit code.
 * @param code - Raw code (e.g. C48542) or undefined.
 * @returns Display string, or undefined if unknown.
 */
export function getQuantityQualifierLabel(code: string | undefined): string | undefined {
  if (!code?.trim()) {
    return undefined;
  }
  const k = code.trim();
  return STATIC_BY_CODE[k];
}

/**
 * Synonym patterns for NCI codes whose `name` (as returned by
 * `GET /v3/prescription/quantityqualifier`) is unlikely to appear verbatim in a
 * sig line — e.g. ScriptSure ships "Tablet dosing unit" but sigs say "tablet"
 * or "tab"; "International unit" has the abbreviation "IU". These extend
 * whatever regex we generate from the live catalog so the matcher works against
 * realistic sig text without depending on the catalog's exact wording.
 */
const QUALIFIER_SYNONYMS: Readonly<Record<string, readonly RegExp[]>> = {
  C28254: [/\b(?:milliliters?|millilitres?|ml|mls)\b/i],
  C48481: [/\b(?:milligrams?|mg)\b/i],
  C48482: [/\b(?:micrograms?|mcg|µg)\b/i],
  C48478: [/\b(?:grams?|gm|gms)\b/i],
  C48479: [/\b(?:international\s+units?|iu)\b/i],
  C48483: [/\b(?:capsules?|caps?)\b/i],
  C48542: [/\b(?:tablets?|tabs?)\b/i],
  C48486: [/\bsuppositor(?:y|ies)\b/i],
  C78783: [/\bapplicatorful?s?\b/i],
  C62412: [/\bapplicators?\b/i],
  C48484: [/\bpatch(?:es)?\b/i],
  C48485: [/\bsprays?\b/i],
  C48477: [/\bdrops?\b/i],
  C48487: [/\bsyringes?\b/i],
  C48488: [/\bvials?\b/i],
  C48473: [/\b(?:ampoules?|ampules?)\b/i],
  C48474: [/\bbags?\b/i],
  C48475: [/\bbars?\b/i],
};

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * A function that returns the best NCI potency-unit code for a free-text
 * fragment (sig line, formulation label, …) or `undefined` when no candidate
 * matches. Built from a quantity-qualifier catalog by {@link buildQualifierMatcher}.
 */
export type QualifierMatcher = (text: string | undefined) => string | undefined;

interface CompiledRule {
  code: string;
  pattern: RegExp;
}

/**
 * Compiles a {@link QualifierMatcher} from a quantity-qualifier catalog.
 *
 * For each catalog entry we register either:
 *  - the explicit synonym patterns from {@link QUALIFIER_SYNONYMS} (for codes
 *    whose `name` doesn't read well as a sig keyword, e.g. C48542 → "tablet"),
 *  - or a word-boundary regex around the catalog `name` (with optional
 *    plural `s`).
 *
 * Rules are sorted by `name` length descending so that more specific entries
 * win over shorter prefixes (e.g. "Applicatorful" beats "Applicator").
 *
 * @param catalog - Live response from `GET /v3/prescription/quantityqualifier`
 *   (and/or the static fallback rows).
 * @returns A {@link QualifierMatcher} closed over the catalog.
 */
export function buildQualifierMatcher(catalog: readonly { potencyUnit: string; name: string }[]): QualifierMatcher {
  const ordered = [...catalog]
    .filter((row) => row.potencyUnit?.trim() && row.name?.trim())
    .sort((a, b) => b.name.length - a.name.length);

  const compiled: CompiledRule[] = [];
  for (const row of ordered) {
    const synonyms = QUALIFIER_SYNONYMS[row.potencyUnit];
    if (synonyms) {
      for (const pattern of synonyms) {
        compiled.push({ code: row.potencyUnit, pattern });
      }
      continue;
    }
    const escaped = row.name.trim().replace(REGEX_ESCAPE, '\\$&');
    compiled.push({ code: row.potencyUnit, pattern: new RegExp(`\\b${escaped}s?\\b`, 'i') });
  }

  return (text) => {
    if (!text) {
      return undefined;
    }
    for (const rule of compiled) {
      if (rule.pattern.test(text)) {
        return rule.code;
      }
    }
    return undefined;
  };
}

/**
 * Default {@link QualifierMatcher} built from the static catalog. Used when
 * the live `/v3/prescription/quantityqualifier` response hasn't loaded yet (or
 * the bot call failed).
 */
export const STATIC_QUALIFIER_MATCHER: QualifierMatcher = buildQualifierMatcher(
  STATIC_QUANTITY_QUALIFIERS.map((r) => ({ potencyUnit: r.code, name: r.label }))
);

/**
 * Infers a quantity-qualifier (NCI potency-unit) code from free-text such as a
 * sig line ("Insert 1 suppository rectally daily") or a drug-formulation label
 * ("Anusol-HC 25 mg rectal suppository") using the static fallback matcher.
 *
 * Prefer {@link inferQuantityQualifierCodeWith} when a live catalog is
 * available so newly added DAW codes are picked up automatically.
 *
 * @param textParts - Strings to scan; empty/undefined entries are ignored.
 * @returns NCI code (e.g. `C48486`) or `undefined` when no keyword matches.
 */
export function inferQuantityQualifierCode(...textParts: (string | undefined)[]): string | undefined {
  return inferQuantityQualifierCodeWith(STATIC_QUALIFIER_MATCHER, ...textParts);
}

/**
 * Variant of {@link inferQuantityQualifierCode} that uses a caller-supplied
 * {@link QualifierMatcher} (typically built from the live DAW catalog via
 * {@link buildQualifierMatcher}).
 *
 * @param matcher - Compiled matcher (from live or static catalog).
 * @param textParts - Strings to scan; empty/undefined entries are ignored.
 * @returns NCI code or `undefined`.
 */
export function inferQuantityQualifierCodeWith(
  matcher: QualifierMatcher,
  ...textParts: (string | undefined)[]
): string | undefined {
  const haystack = textParts.filter(Boolean).join(' ');
  if (!haystack.trim()) {
    return undefined;
  }
  return matcher(haystack);
}

/**
 * Merge live API results over static entries (API wins on duplicate codes).
 * @param live - Rows from GET /v3/prescription/quantityqualifier.
 * @returns Sorted list for select controls.
 */
export function mergeQuantityQualifierCatalog(
  live: readonly { potencyUnit: string; name: string }[]
): { code: string; label: string }[] {
  const map = new Map<string, string>();
  for (const row of STATIC_QUANTITY_QUALIFIERS) {
    map.set(row.code, row.label);
  }
  for (const row of live) {
    if (row.potencyUnit && row.name) {
      map.set(row.potencyUnit, row.name);
    }
  }
  return [...map.entries()].map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label));
}
