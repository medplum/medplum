// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * NCI Thesaurus potency-unit codes used by DAW/ScriptSure as quantity qualifiers
 * (`potencyUnit` from GET /v3/prescription/quantityqualifier).
 *
 * This static table is a fallback for when the live catalog has not loaded yet
 * (and the sole source for {@link getQuantityQualifierLabel}, which renders a
 * persisted `MedicationRequest.dispenseRequest.quantity.unit`).
 *
 * The codes below are taken verbatim from the live staging catalog
 * (`GET /v3/prescription/quantityqualifier`). An earlier version of this table
 * used guessed sequential `C484xx` codes that were mostly WRONG — e.g. it mapped
 * Gram→C48478, but the catalog says C48478 is **Box** and Gram is **C48155**;
 * likewise Each, Drop, Capsule, Patch, Milligram, Suppository, Syringe, and Vial
 * were all bound to the wrong code. That corrupted the dropdown and the details
 * display. See wiki/contradictions.md ("static quantity-qualifier table codes").
 *
 * @see https://scriptsure.stoplight.io/docs/scriptsure-advanced/9tbm26mytiwwy-get-quantity-qualifiers
 */
export const STATIC_QUANTITY_QUALIFIERS: readonly { readonly code: string; readonly label: string }[] = [
  { code: 'C48473', label: 'Ampule' },
  { code: 'C62412', label: 'Applicator' },
  { code: 'C78783', label: 'Applicatorful' },
  { code: 'C48474', label: 'Bag' },
  { code: 'C48475', label: 'Bar' },
  { code: 'C48477', label: 'Bottle' },
  { code: 'C48478', label: 'Box' },
  { code: 'C48480', label: 'Capsule' },
  { code: 'C48481', label: 'Cartridge' },
  { code: 'C48484', label: 'Container' },
  { code: 'C48491', label: 'Drop' },
  { code: 'C64933', label: 'Each' },
  { code: 'C48155', label: 'Gram' },
  { code: 'C48504', label: 'Kit' },
  { code: 'C48506', label: 'Lozenge' },
  { code: 'C48152', label: 'Microgram' },
  { code: 'C28253', label: 'Milligram' },
  { code: 'C28254', label: 'Milliliter' },
  { code: 'C48521', label: 'Packet' },
  { code: 'C48524', label: 'Patch' },
  { code: 'C48537', label: 'Spray' },
  { code: 'C48539', label: 'Suppository' },
  { code: 'C48540', label: 'Syringe' },
  { code: 'C48542', label: 'Tablet' },
  { code: 'C48548', label: 'Troche' },
  { code: 'C48549', label: 'Tube' },
  { code: 'C44278', label: 'Unit' },
  { code: 'C48551', label: 'Vial' },
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
 * @returns NCI code (e.g. `C48539` for Suppository) or `undefined` when no
 *   keyword matches.
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

/**
 * Extracts the dispense-unit token from a ScriptSure pre-built sig line.
 *
 * The drug-format endpoint (`GET /v3/drugformat/format/{routedMedId}`) does not
 * return a per-sig `quantityQualifier`; instead every sig line is built as
 * `"<formatQuantity> <QuantityQualifierName> - <instructions>"`, e.g.
 * `"30 Gram - Apply to skin three times daily"` or
 * `"80 Tablet - Take 2 tablet by mouth"`. The token between the leading quantity
 * and the ` - ` separator is therefore the authoritative dispense unit for the
 * format (ScriptSure derives it from the same quantity-qualifier catalog we
 * fetch), and is more reliable than scanning the free instruction text — which
 * deliberately ignores "gram" (a strength unit inside "500 mg tablet" but the
 * real dispense unit for topicals sold by weight).
 *
 * @param sigLine - Pre-built sig line from a ScriptSure drug format.
 * @returns The unit token (e.g. `"Gram"`, `"Tablet"`), or undefined when the
 *   line does not start with the expected `<number> <unit> -` shape.
 */
export function extractLeadingSigDispenseUnit(sigLine: string | undefined): string | undefined {
  if (!sigLine) {
    return undefined;
  }
  const match = /^\s*\d+(?:\.\d+)?\s+([A-Za-z][A-Za-z ]*?)\s+[-–—]/.exec(sigLine);
  return match?.[1]?.trim() || undefined;
}

/**
 * Abbreviations / label variants a leading sig-unit token may use that differ
 * from the canonical catalog `name`. Keys and values are lowercased.
 */
const LEADING_UNIT_NAME_ALIASES: Readonly<Record<string, string>> = {
  tab: 'tablet',
  tabs: 'tablet',
  cap: 'capsule',
  caps: 'capsule',
};

/**
 * Normalizes a unit name for lookup: lowercases, maps common abbreviations
 * (tab→tablet, cap→capsule), and strips the ScriptSure "... dosing unit" suffix
 * so `"Tablet dosing unit"` and `"Tablet"` collapse to the same key.
 * @param name - Raw unit name / token.
 * @returns Normalized lookup key.
 */
function normalizeUnitName(name: string): string {
  const lowered = name
    .trim()
    .toLowerCase()
    .replace(/\s+dosing unit$/, '');
  return LEADING_UNIT_NAME_ALIASES[lowered] ?? lowered;
}

/**
 * Builds a resolver mapping a dispense-unit *name* (typically the token from
 * {@link extractLeadingSigDispenseUnit}) to its NCI potency-unit code.
 *
 * Unlike {@link buildQualifierMatcher}, this does NOT drop "strength-style"
 * units such as Gram or Milligram: in the leading dispense position those ARE
 * the dispense unit, so whatever the catalog names is trusted. Names are
 * normalized via {@link normalizeUnitName} so `"Tablet"`, `"tab"`, and
 * `"Tablet dosing unit"` all resolve.
 *
 * @param catalog - Live and/or static rows ({ potencyUnit, name }).
 * @returns A function mapping a unit name to its code, or undefined.
 */
export function buildDispenseUnitNameResolver(
  catalog: readonly { potencyUnit: string; name: string }[]
): (unitName: string | undefined) => string | undefined {
  const byName = new Map<string, string>();
  for (const row of catalog) {
    const code = row.potencyUnit?.trim();
    const name = row.name?.trim();
    if (code && name) {
      const key = normalizeUnitName(name);
      // First-wins on normalized-key collisions (e.g. "Tablet" and "Tablet
      // dosing unit" both normalize to "tablet"). This is only ambiguous if a
      // catalog ever carries two such rows with *different* codes; today the
      // static table and observed live catalog do not, so catalog row order is
      // not significant in practice.
      if (!byName.has(key)) {
        byName.set(key, code);
      }
    }
  }
  return (unitName) => {
    if (!unitName?.trim()) {
      return undefined;
    }
    return byName.get(normalizeUnitName(unitName));
  };
}

/**
 * Default name resolver built from the static fallback catalog, used until the
 * live `/v3/prescription/quantityqualifier` response loads.
 */
export const STATIC_DISPENSE_UNIT_NAME_RESOLVER = buildDispenseUnitNameResolver(
  STATIC_QUANTITY_QUALIFIERS.map((r) => ({ potencyUnit: r.code, name: r.label }))
);

/** Default dispense-unit code when nothing else resolves: `C48542` (Tablet). */
export const DEFAULT_QUANTITY_QUALIFIER = 'C48542';

/** A resolver mapping a dispense-unit name to an NCI potency-unit code. */
export type DispenseUnitNameResolver = (unitName: string | undefined) => string | undefined;

/** Matches an NCI Thesaurus code (e.g. `C48155`). */
const NCI_CODE_RE = /^C\d+$/;

/**
 * Resolves the dispense unit (NCI potency code) for a sig.
 *
 * The ScriptSure drug-format endpoint encodes the dispense unit as the leading
 * token of the sig line (`"30 Gram - …"`, `"80 Tablet - …"`) and usually omits a
 * per-sig `quantityQualifier`. When a `raw` qualifier IS present it comes from
 * that same drug-format sig (not a separately edited resource) and cannot be
 * trusted blindly — ScriptSure frequently sends a strength-unit code for solid
 * dose forms — so we prefer the authoritative leading sig-unit token and only
 * fall back to `raw`, then to free-text keyword inference.
 *
 * NOTE: this is deliberate, not a stopgap — the v4 Advanced API (as of the
 * 2026-07-01 docs capture) exposes NO deterministic per-drug dispense-unit
 * lookup; `quantityQualifier` is only a caller-supplied write field, and drug
 * reads return dose-form *text* (`MED_DOSAGE_FORM_DESC`), not an NCI code. The
 * leading sig token IS the deterministic signal (ScriptSure builds it from the
 * same quantity-qualifier catalog). See the KB:
 * wiki/fhir/medication-quantity-qualifiers.md + wiki/contradictions.md.
 *
 * Priority:
 *  1. The leading `"<qty> <unit> - …"` token from the sig line, resolved via the
 *     live/static catalog (fixes topicals/liquids like `"30 Gram"` → Gram). This
 *     is the deterministic signal ScriptSure builds from the same catalog, so it
 *     is preferred over `raw`.
 *  2. `raw` when ScriptSure/caller supplied a valid NCI code the leading token
 *     could not resolve. NOTE: ScriptSure's per-sig `quantityQualifier` often
 *     carries a *strength*-unit code for solid dose forms (e.g. a metformin
 *     tablet coming back with the Milligram code because the formulation strength
 *     is "500 mg"), and `NCI_CODE_RE` cannot tell a strength code from a dispense
 *     code — which is exactly why `raw` must rank below the leading sig-unit token
 *     rather than above it.
 *  3. Keyword inference from sig line + formulation label (dose-form / volume).
 *  4. The static `C48542` Tablet fallback.
 *
 * @param raw - Value already on the sig (usually absent for drug-format sigs).
 * @param sigLine - Sig text shown to the prescriber.
 * @param formatText - Formulation label (e.g. drug `code.text`) when known.
 * @param matcher - Catalog-aware matcher used for keyword inference.
 * @param unitResolver - Catalog-aware name→code resolver for the leading token.
 * @returns NCI potency-unit code; never empty.
 */
export function resolveQuantityQualifier(
  raw: string | undefined,
  sigLine: string,
  formatText: string | undefined,
  matcher: QualifierMatcher,
  unitResolver: DispenseUnitNameResolver
): string {
  const fromSigUnit = unitResolver(extractLeadingSigDispenseUnit(sigLine));
  if (fromSigUnit) {
    return fromSigUnit;
  }
  const trimmedRaw = raw?.trim();
  if (trimmedRaw && NCI_CODE_RE.test(trimmedRaw)) {
    return trimmedRaw;
  }
  const inferred = inferQuantityQualifierCodeWith(matcher, sigLine, formatText);
  if (inferred) {
    return inferred;
  }
  return trimmedRaw || DEFAULT_QUANTITY_QUALIFIER;
}
