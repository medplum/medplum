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
 * Priority tiers for qualifier rules. Higher-priority rules win during matching
 * regardless of how long the catalog `name` happens to be:
 *
 *  - `DOSE_FORM` covers solid/discrete dispense units (tablet, capsule, suppository,
 *    cartridge, …). These ALWAYS beat strength units in mixed text like
 *    "Metformin ER 500 mg tablet" because mg is a strength on a tablet, never the
 *    dispense unit.
 *  - `DOSE_FORM_SPECIFIC` is a +10 bump for entries that must beat a less-specific
 *    sibling (e.g. "Applicatorful" beats "Applicator").
 *  - `LIQUID_VOLUME` covers `mL`, which CAN be the dispense unit (liquid bottles)
 *    but loses to dose forms when both appear in the same string.
 *  - `CATALOG_NAME` is the default for live-catalog entries we don't know about
 *    — we generate `\b<name>s?\b` and trust that future DAW codes (e.g. "Lozenge")
 *    look like real words.
 *  - `STRENGTH_UNIT` is `null` (no rule emitted at all). mg, mcg, gm, IU are
 *    strength/concentration units, never dispense units, so they should not show
 *    up as inferred qualifiers — even when the live catalog includes them. Such
 *    codes still appear in `mergeQuantityQualifierCatalog` for the dropdown.
 */
const PRIORITY_DOSE_FORM = 100;
const PRIORITY_DOSE_FORM_SPECIFIC = 110;
const PRIORITY_LIQUID_VOLUME = 30;
const PRIORITY_CATALOG_NAME = 50;

interface SynonymGroup {
  readonly priority: number;
  readonly patterns: readonly RegExp[];
}

const TABLET_GROUP: SynonymGroup = {
  priority: PRIORITY_DOSE_FORM,
  patterns: [/\b(?:tablets?|tabs?)\b/i],
};
const CAPSULE_GROUP: SynonymGroup = {
  priority: PRIORITY_DOSE_FORM,
  patterns: [/\b(?:capsules?|caps?)\b/i],
};

/**
 * Synonym patterns + priority for qualifier rows, keyed by the lowercased
 * canonical `name` returned by `GET /v3/prescription/quantityqualifier` (and
 * any practical aliases — e.g. ScriptSure ships "Tablet dosing unit" but sigs
 * say "tablet" / "tab").
 *
 * Rows where the value is `null` are explicitly excluded from the matcher
 * (strength units like Milligram). They remain selectable in the dropdown
 * via {@link mergeQuantityQualifierCatalog}.
 */
const QUALIFIER_SYNONYMS_BY_NAME: Readonly<Record<string, SynonymGroup | null>> = {
  tablet: TABLET_GROUP,
  'tablet dosing unit': TABLET_GROUP,
  capsule: CAPSULE_GROUP,
  'capsule dosing unit': CAPSULE_GROUP,
  suppository: { priority: PRIORITY_DOSE_FORM, patterns: [/\bsuppositor(?:y|ies)\b/i] },
  patch: { priority: PRIORITY_DOSE_FORM, patterns: [/\bpatch(?:es)?\b/i] },
  spray: { priority: PRIORITY_DOSE_FORM, patterns: [/\bsprays?\b/i] },
  drop: { priority: PRIORITY_DOSE_FORM, patterns: [/\bdrops?\b/i] },
  syringe: { priority: PRIORITY_DOSE_FORM, patterns: [/\bsyringes?\b/i] },
  vial: { priority: PRIORITY_DOSE_FORM, patterns: [/\bvials?\b/i] },
  ampule: { priority: PRIORITY_DOSE_FORM, patterns: [/\b(?:ampoules?|ampules?)\b/i] },
  ampoule: { priority: PRIORITY_DOSE_FORM, patterns: [/\b(?:ampoules?|ampules?)\b/i] },
  bag: { priority: PRIORITY_DOSE_FORM, patterns: [/\bbags?\b/i] },
  bar: { priority: PRIORITY_DOSE_FORM, patterns: [/\bbars?\b/i] },
  cartridge: { priority: PRIORITY_DOSE_FORM, patterns: [/\bcartridges?\b/i] },
  applicator: { priority: PRIORITY_DOSE_FORM, patterns: [/\bapplicators?\b/i] },
  applicatorful: { priority: PRIORITY_DOSE_FORM_SPECIFIC, patterns: [/\bapplicatorful?s?\b/i] },
  milliliter: { priority: PRIORITY_LIQUID_VOLUME, patterns: [/\b(?:milliliters?|millilitres?|ml|mls)\b/i] },
  millilitre: { priority: PRIORITY_LIQUID_VOLUME, patterns: [/\b(?:milliliters?|millilitres?|ml|mls)\b/i] },
  milligram: null,
  microgram: null,
  gram: null,
  'international unit': null,
};

/**
 * Escape a string for use as a literal inside a RegExp pattern.
 * @param text - Raw catalog name or other user-supplied substring.
 * @returns The same string with regex metacharacters escaped.
 */
function escapeRegexLiteral(text: string): string {
  // RegExp.escape (ES2025) lands in Node 23+; CI still runs Node 22.
  if (typeof RegExp.escape === 'function') {
    return RegExp.escape(text);
  }
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * A function that returns the best NCI potency-unit code for a free-text
 * fragment (sig line, formulation label, …) or `undefined` when no candidate
 * matches. Built from a quantity-qualifier catalog by {@link buildQualifierMatcher}.
 */
export type QualifierMatcher = (text: string | undefined) => string | undefined;

interface CompiledRule {
  code: string;
  pattern: RegExp;
  priority: number;
  nameLength: number;
}

/**
 * Compiles a {@link QualifierMatcher} from a quantity-qualifier catalog.
 *
 * Each catalog row is classified by canonical `name` (lowercased):
 *  - **Known dose form** (tablet, capsule, suppository, patch, spray, drop,
 *    syringe, vial, ampule, bag, bar, cartridge, applicator/applicatorful) →
 *    use the explicit synonym patterns at `PRIORITY_DOSE_FORM` (or
 *    `PRIORITY_DOSE_FORM_SPECIFIC` for the "applicatorful > applicator" case).
 *  - **Liquid volume** (milliliter / millilitre) → `PRIORITY_LIQUID_VOLUME`,
 *    so a sig like "Take 1 tablet … 250 mg/5 mL strength" picks Tablet.
 *  - **Strength unit** (milligram, microgram, gram, international unit) → the
 *    map yields `null` and we emit no rule, because mg/mcg/gm/IU are never the
 *    real dispense unit on a solid dose form. They remain available as
 *    dropdown options via {@link mergeQuantityQualifierCatalog}.
 *  - **Anything else** (e.g. a brand-new code DAW ships before we've heard of
 *    it) → we generate `\b<name>s?\b` at `PRIORITY_CATALOG_NAME` so the
 *    matcher still recognizes it without any code changes.
 *
 * Rules are sorted by `priority` descending, then by `name.length` descending
 * as a tiebreaker (matters for ties like "Applicator" vs "Applicators" or
 * future synonym overlaps).
 *
 * @param catalog - Live response from `GET /v3/prescription/quantityqualifier`
 *   (and/or the static fallback rows).
 * @returns A {@link QualifierMatcher} closed over the catalog.
 */
export function buildQualifierMatcher(catalog: readonly { potencyUnit: string; name: string }[]): QualifierMatcher {
  const compiled: CompiledRule[] = [];
  for (const row of catalog) {
    const code = row.potencyUnit?.trim();
    const name = row.name?.trim();
    if (!code || !name) {
      continue;
    }
    const synonym = QUALIFIER_SYNONYMS_BY_NAME[name.toLowerCase()];
    if (synonym === null) {
      continue;
    }
    if (synonym) {
      for (const pattern of synonym.patterns) {
        compiled.push({ code, pattern, priority: synonym.priority, nameLength: name.length });
      }
      continue;
    }
    const escaped = escapeRegexLiteral(name);
    compiled.push({
      code,
      pattern: new RegExp(String.raw`\b${escaped}s?\b`, 'i'),
      priority: PRIORITY_CATALOG_NAME,
      nameLength: name.length,
    });
  }

  compiled.sort((a, b) => b.priority - a.priority || b.nameLength - a.nameLength);

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
