// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest';
import {
  buildQualifierMatcher,
  getQuantityQualifierLabel,
  inferQuantityQualifierCode,
  inferQuantityQualifierCodeWith,
  mergeQuantityQualifierCatalog,
  STATIC_QUALIFIER_MATCHER,
} from './quantity-qualifiers';

describe('quantity-qualifiers', () => {
  test('getQuantityQualifierLabel returns label for known code', () => {
    expect(getQuantityQualifierLabel('C48542')).toBe('Tablet dosing unit');
    expect(getQuantityQualifierLabel('C48486')).toBe('Suppository');
    expect(getQuantityQualifierLabel('  C48483  ')).toBe('Capsule');
  });

  test('getQuantityQualifierLabel returns undefined for empty/unknown codes', () => {
    expect(getQuantityQualifierLabel(undefined)).toBeUndefined();
    expect(getQuantityQualifierLabel('')).toBeUndefined();
    expect(getQuantityQualifierLabel('UNKNOWN')).toBeUndefined();
  });

  test('inferQuantityQualifierCode picks suppository for rectal sigs', () => {
    expect(
      inferQuantityQualifierCode('Insert 1 suppository rectally daily', 'Anusol-HC 25 mg rectal suppository')
    ).toBe('C48486');
  });

  test('inferQuantityQualifierCode falls back to formulation text when sig is generic', () => {
    expect(inferQuantityQualifierCode('Use as directed', 'Lidocaine 5% patch')).toBe('C48484');
    expect(inferQuantityQualifierCode('Use as directed', 'Albuterol HFA inhalation spray')).toBe('C48485');
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

  test('inferQuantityQualifierCodeWith uses caller-supplied matcher', () => {
    const liveOnlyMatcher = buildQualifierMatcher([{ potencyUnit: 'C48486', name: 'Suppository' }]);
    expect(inferQuantityQualifierCodeWith(liveOnlyMatcher, 'Insert 1 suppository rectally daily')).toBe('C48486');
    expect(inferQuantityQualifierCodeWith(liveOnlyMatcher, 'Take 1 capsule by mouth twice daily')).toBeUndefined();
  });

  test('STATIC_QUALIFIER_MATCHER backs the legacy inferQuantityQualifierCode helper', () => {
    expect(STATIC_QUALIFIER_MATCHER('Insert 1 suppository rectally daily')).toBe('C48486');
    expect(inferQuantityQualifierCode('Insert 1 suppository rectally daily')).toBe('C48486');
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
});
