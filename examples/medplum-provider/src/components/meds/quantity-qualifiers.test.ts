// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';
import {
  buildDispenseUnitNameResolver,
  buildQualifierMatcher,
  extractLeadingSigDispenseUnit,
  getQuantityQualifierLabel,
  inferQuantityQualifierCode,
  inferQuantityQualifierCodeWith,
  mergeQuantityQualifierCatalog,
  STATIC_DISPENSE_UNIT_NAME_RESOLVER,
  STATIC_QUALIFIER_MATCHER,
} from './quantity-qualifiers';

describe('quantity-qualifiers', () => {
  test('getQuantityQualifierLabel returns label for known code', () => {
    // Codes verified against the live GET /v3/prescription/quantityqualifier catalog.
    expect(getQuantityQualifierLabel('C48542')).toBe('Tablet');
    expect(getQuantityQualifierLabel('C48539')).toBe('Suppository');
    expect(getQuantityQualifierLabel('  C48480  ')).toBe('Capsule');
    expect(getQuantityQualifierLabel('C48155')).toBe('Gram');
  });

  test('getQuantityQualifierLabel returns undefined for empty/unknown codes', () => {
    expect(getQuantityQualifierLabel(undefined)).toBeUndefined();
    expect(getQuantityQualifierLabel('')).toBeUndefined();
    expect(getQuantityQualifierLabel('UNKNOWN')).toBeUndefined();
  });

  test('inferQuantityQualifierCode picks suppository for rectal sigs', () => {
    expect(
      inferQuantityQualifierCode('Insert 1 suppository rectally daily', 'Anusol-HC 25 mg rectal suppository')
    ).toBe('C48539');
  });

  test('inferQuantityQualifierCode falls back to formulation text when sig is generic', () => {
    expect(inferQuantityQualifierCode('Use as directed', 'Lidocaine 5% patch')).toBe('C48524');
    expect(inferQuantityQualifierCode('Use as directed', 'Albuterol HFA inhalation spray')).toBe('C48537');
  });

  test('inferQuantityQualifierCode prefers more specific terms', () => {
    expect(inferQuantityQualifierCode('Insert 1 applicatorful intravaginally at bedtime')).toBe('C78783');
    expect(inferQuantityQualifierCode('Apply 1 applicator twice daily')).toBe('C62412');
  });

  test('inferQuantityQualifierCode returns undefined for unrecognized text', () => {
    expect(inferQuantityQualifierCode('No measurable form here')).toBeUndefined();
    expect(inferQuantityQualifierCode(undefined, '')).toBeUndefined();
  });

  test('buildQualifierMatcher resolves codes from live catalog names', () => {
    const matcher = buildQualifierMatcher([
      { potencyUnit: 'C48473', name: 'Ampule' },
      { potencyUnit: 'C48486', name: 'Suppository' },
      { potencyUnit: 'C48542', name: 'Tablet dosing unit' },
    ]);
    expect(matcher('Insert 1 suppository rectally daily')).toBe('C48486');
    expect(matcher('Take 1 tablet by mouth twice daily')).toBe('C48542');
    expect(matcher('Inject 1 ampule intramuscularly')).toBe('C48473');
    expect(matcher('No measurable form')).toBeUndefined();
  });

  test('buildQualifierMatcher prefers longer names (Applicatorful > Applicator)', () => {
    const matcher = buildQualifierMatcher([
      { potencyUnit: 'C62412', name: 'Applicator' },
      { potencyUnit: 'C78783', name: 'Applicatorful' },
    ]);
    expect(matcher('Insert 1 applicatorful intravaginally at bedtime')).toBe('C78783');
    expect(matcher('Use 1 applicator twice daily')).toBe('C62412');
  });

  test('buildQualifierMatcher honors a brand-new code shipped only by the live API', () => {
    const matcher = buildQualifierMatcher([
      { potencyUnit: 'C99999', name: 'Lozenge' },
      ...[{ potencyUnit: 'C48542', name: 'Tablet dosing unit' }],
    ]);
    expect(matcher('Dissolve 1 lozenge in mouth every 4 hours')).toBe('C99999');
  });

  test('buildQualifierMatcher treats regex metacharacters in catalog names as literals', () => {
    const matcher = buildQualifierMatcher([{ potencyUnit: 'C88888', name: 'dose.form' }]);
    expect(matcher('Apply 1 dose.form topically')).toBe('C88888');
    expect(matcher('Apply 1 doseXform topically')).toBeUndefined();
  });

  test('inferQuantityQualifierCodeWith uses caller-supplied matcher', () => {
    const liveOnlyMatcher = buildQualifierMatcher([{ potencyUnit: 'C48486', name: 'Suppository' }]);
    expect(inferQuantityQualifierCodeWith(liveOnlyMatcher, 'Insert 1 suppository rectally daily')).toBe('C48486');
    expect(inferQuantityQualifierCodeWith(liveOnlyMatcher, 'Take 1 capsule by mouth twice daily')).toBeUndefined();
  });

  test('STATIC_QUALIFIER_MATCHER backs the legacy inferQuantityQualifierCode helper', () => {
    expect(STATIC_QUALIFIER_MATCHER('Insert 1 suppository rectally daily')).toBe('C48539');
    expect(inferQuantityQualifierCode('Insert 1 suppository rectally daily')).toBe('C48539');
  });

  test('buildQualifierMatcher prefers dose-form keywords over strength units regardless of catalog name length', () => {
    // Regression: matcher used to sort compiled rules by catalog-name length
    // and key synonyms by NCI code. So if DAW returned "Tablet" (len 6) and
    // "Milligram" (len 9), Milligram sorted first and `mg` in the formulation
    // (e.g. "Metformin 500 mg tablet, ER 24 hr") matched before "tablet". A
    // related variant: with `C48481` historically labeled "Milligram" in the
    // static fallback, /mg/ was bound to Cartridge in the live catalog.
    //
    // Now: dose-form keywords (tablet/capsule/suppository/...) carry a fixed
    // priority that beats every other rule, and strength units (mg/mcg/gm/IU)
    // are not synonyms at all (they are never a real dispense unit on a
    // solid dose form).
    const matcher = buildQualifierMatcher([
      { potencyUnit: 'C48481', name: 'Cartridge' },
      { potencyUnit: 'C28253', name: 'Milligram' },
      { potencyUnit: 'C48542', name: 'Tablet' },
    ]);
    expect(matcher('Metformin ER 500 mg tablet, extended release 24 hr')).toBe('C48542');
    expect(matcher('Norvasc 5 mg tablet')).toBe('C48542');
    expect(matcher('Take 1 by mouth daily Norvasc 5 mg')).toBeUndefined();
    expect(matcher('Insulin pen cartridge 100 units/mL')).toBe('C48481');
  });

  test('buildQualifierMatcher prefers dose-form keywords over Milliliter for solid forms with strength like X mg/5 mL', () => {
    const matcher = buildQualifierMatcher([
      { potencyUnit: 'C28254', name: 'Milliliter' },
      { potencyUnit: 'C48542', name: 'Tablet dosing unit' },
    ]);
    expect(matcher('Take 1 tablet by mouth twice daily; 250 mg/5 mL strength')).toBe('C48542');
    expect(matcher('Take 5 mL by mouth twice daily')).toBe('C28254');
  });

  test('mergeQuantityQualifierCatalog overrides static labels with live names', () => {
    const merged = mergeQuantityQualifierCatalog([
      { potencyUnit: 'C48542', name: 'Tablet' },
      { potencyUnit: 'C99999', name: 'Made-up unit' },
    ]);
    expect(merged.find((r) => r.code === 'C48542')?.label).toBe('Tablet');
    expect(merged.find((r) => r.code === 'C99999')?.label).toBe('Made-up unit');
    expect(merged).toEqual([...merged].sort((a, b) => a.label.localeCompare(b.label)));
  });

  describe('extractLeadingSigDispenseUnit', () => {
    test('reads the unit token from a ScriptSure pre-built sig line', () => {
      // Verbatim staging shapes: mupirocin ointment and metformin tablet.
      expect(extractLeadingSigDispenseUnit('30 Gram - Apply to skin three times daily (use small amount)')).toBe(
        'Gram'
      );
      expect(extractLeadingSigDispenseUnit('80 Tablet - Take 2 tablet by mouth four times daily')).toBe('Tablet');
      expect(extractLeadingSigDispenseUnit('150 Milliliter - Take 5 mL by mouth twice daily')).toBe('Milliliter');
    });

    test('tolerates decimals and en/em dashes', () => {
      expect(extractLeadingSigDispenseUnit('2.5 Milliliter – inject subcutaneously')).toBe('Milliliter');
    });

    test('returns undefined when the line does not lead with <number> <unit> -', () => {
      expect(extractLeadingSigDispenseUnit('Take as directed')).toBeUndefined();
      expect(extractLeadingSigDispenseUnit('Apply to affected area')).toBeUndefined();
      expect(extractLeadingSigDispenseUnit('')).toBeUndefined();
      expect(extractLeadingSigDispenseUnit(undefined)).toBeUndefined();
    });
  });

  describe('buildDispenseUnitNameResolver', () => {
    const resolver = buildDispenseUnitNameResolver([
      { potencyUnit: 'C48155', name: 'Gram' },
      { potencyUnit: 'C48542', name: 'Tablet' },
      { potencyUnit: 'C48480', name: 'Capsule' },
      { potencyUnit: 'C28254', name: 'Milliliter' },
    ]);

    test('resolves a leading sig unit to its NCI code (including "strength" units like Gram)', () => {
      expect(resolver(extractLeadingSigDispenseUnit('30 Gram - Apply to skin'))).toBe('C48155');
      expect(resolver(extractLeadingSigDispenseUnit('80 Tablet - Take 2 tablet'))).toBe('C48542');
    });

    test('is case-insensitive and maps tab/cap abbreviations and "... dosing unit"', () => {
      expect(resolver('gram')).toBe('C48155');
      expect(resolver('TAB')).toBe('C48542');
      expect(resolver('caps')).toBe('C48480');
      expect(buildDispenseUnitNameResolver([{ potencyUnit: 'C48542', name: 'Tablet dosing unit' }])('Tablet')).toBe(
        'C48542'
      );
    });

    test('returns undefined for unknown/blank names', () => {
      expect(resolver('Widget')).toBeUndefined();
      expect(resolver('')).toBeUndefined();
      expect(resolver(undefined)).toBeUndefined();
    });

    test('STATIC_DISPENSE_UNIT_NAME_RESOLVER resolves Gram and Tablet from the static fallback', () => {
      expect(STATIC_DISPENSE_UNIT_NAME_RESOLVER('Gram')).toBe('C48155');
      expect(STATIC_DISPENSE_UNIT_NAME_RESOLVER('Tablet')).toBe('C48542');
    });
  });
});
