// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import {
  addDiagnosis,
  addLine,
  finishClaimEdit,
  getLineCharge,
  getLineUnitPrice,
  MAX_CLAIM_DIAGNOSES,
  moveDiagnosis,
  moveLine,
  removeDiagnosis,
  removeLine,
  replaceDiagnosis,
  updateLine,
} from './claimEditing';

const claim: Claim = {
  resourceType: 'Claim',
  status: 'draft',
  use: 'claim',
  created: '2026-09-04',
  type: { coding: [{ code: 'professional' }] },
  priority: { coding: [{ code: 'normal' }] },
  provider: { reference: 'Practitioner/123' },
  patient: { reference: 'Patient/123' },
  insurance: [],
  total: { value: 300, currency: 'USD' },
  diagnosis: [
    { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9' }] } },
    { sequence: 2, diagnosisCodeableConcept: { coding: [{ code: 'I10' }] } },
    { sequence: 3, diagnosisCodeableConcept: { coding: [{ code: 'E78.5' }] } },
  ],
  item: [
    {
      sequence: 1,
      productOrService: { coding: [{ code: '99214' }] },
      diagnosisSequence: [1, 3],
      net: { value: 250, currency: 'USD' },
      encounter: [{ reference: 'Encounter/e1' }],
    },
    { sequence: 2, productOrService: { coding: [{ code: '80053' }] }, diagnosisSequence: [2], net: { value: 50 } },
  ],
};

const codes = (c: Claim): (string | undefined)[] =>
  (c.diagnosis ?? []).map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code);

describe('claimEditing', () => {
  test('removeDiagnosis renumbers the rest and moves the pointers with them', () => {
    const result = removeDiagnosis(claim, 1);
    expect(codes(result)).toEqual(['I10', 'E78.5']);
    expect(result.diagnosis?.map((d) => d.sequence)).toEqual([1, 2]);
    expect(result.diagnosis?.[0].type?.[0].coding?.[0].code).toBe('principal');
    expect(result.item?.[0].diagnosisSequence).toEqual([2]);
    expect(result.item?.[1].diagnosisSequence).toEqual([1]);
  });

  test('removeDiagnosis drops a pointer list left empty', () => {
    const result = removeDiagnosis(claim, 2);
    expect(result.item?.[1].diagnosisSequence).toBeUndefined();
  });

  test('moveDiagnosis makes a diagnosis principal and keeps each line on the same codes', () => {
    const result = moveDiagnosis(claim, 3, 1);
    expect(codes(result)).toEqual(['E78.5', 'E11.9', 'I10']);
    expect(result.item?.[0].diagnosisSequence).toEqual([2, 1]);
    expect(result.item?.[1].diagnosisSequence).toEqual([3]);
    expect(moveDiagnosis(claim, 9, 1)).toBe(claim);
  });

  test('addDiagnosis appends an ICD-10 code', () => {
    const result = addDiagnosis(claim, {
      system: 'http://hl7.org/fhir/sid/icd-10-cm',
      code: 'J06.9',
      display: 'Acute URI',
    });
    expect(result.diagnosis?.[3]).toMatchObject({
      sequence: 4,
      diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'J06.9' }] },
    });
  });

  test('addDiagnosis stops at the claim limit', () => {
    const full: Claim = {
      ...claim,
      diagnosis: Array.from({ length: MAX_CLAIM_DIAGNOSES }, (_, i) => ({ sequence: i + 1 })),
    };
    expect(addDiagnosis(full, { code: 'J06.9' })).toBe(full);
  });

  test('addLine, updateLine and removeLine keep the lines numbered', () => {
    const added = addLine(claim);
    expect(added.item?.[2]).toEqual({
      sequence: 3,
      productOrService: {},
      quantity: { value: 1 },
      encounter: [{ reference: 'Encounter/e1' }],
    });
    expect(addLine({ ...claim, item: undefined }).item).toEqual([
      { sequence: 1, productOrService: {}, quantity: { value: 1 } },
    ]);
    const updated = updateLine(added, 3, { net: { value: 20 } });
    expect(updated.item?.[2].net).toEqual({ value: 20 });
    const removed = removeLine(updated, 1);
    expect(removed.item?.map((i) => [i.sequence, i.productOrService?.coding?.[0]?.code])).toEqual([
      [1, '80053'],
      [2, undefined],
    ]);
  });

  test('getLineCharge falls back to unit price times quantity', () => {
    expect(getLineCharge({ sequence: 1, productOrService: {}, net: { value: 12 } })).toBe(12);
    expect(getLineCharge({ sequence: 1, productOrService: {}, unitPrice: { value: 5 }, quantity: { value: 3 } })).toBe(
      15
    );
    expect(getLineCharge({ sequence: 1, productOrService: {} })).toBe(0);
  });

  test('finishClaimEdit drops lines with no code and totals the rest', () => {
    const result = finishClaimEdit(updateLine(addLine(claim), 3, { net: { value: 99 } }));
    expect(result.item).toHaveLength(2);
    expect(result.total).toEqual({ value: 300, currency: 'USD' });
    expect(finishClaimEdit(removeLine(claim, 1)).total?.value).toBe(50);
  });
  test('replaces a diagnosis code in place, as ICD-10', () => {
    const next = replaceDiagnosis(claim, 2, { code: 'E78.5', display: 'Hyperlipidemia' });
    expect(next.diagnosis?.[1].sequence).toBe(2);
    expect(next.diagnosis?.[1].diagnosisCodeableConcept?.coding?.[0]).toMatchObject({
      code: 'E78.5',
      system: 'http://hl7.org/fhir/sid/icd-10',
    });
  });

  test('gets a unit price from the line, or its charge over its units', () => {
    expect(getLineUnitPrice({ sequence: 1, productOrService: {}, unitPrice: { value: 50 } })).toBe(50);
    expect(getLineUnitPrice({ sequence: 1, productOrService: {}, net: { value: 90 }, quantity: { value: 3 } })).toBe(
      30
    );
    expect(getLineUnitPrice({ sequence: 1, productOrService: {}, net: { value: 90 } })).toBe(90);
    expect(getLineUnitPrice({ sequence: 1, productOrService: {} })).toBeUndefined();
  });
  test('moves a line to a new position and renumbers the lines', () => {
    const next = moveLine(claim, 2, 1);
    expect(next.item?.map((item) => item.productOrService.coding?.[0]?.code)).toEqual(['80053', '99214']);
    expect(next.item?.map((item) => item.sequence)).toEqual([1, 2]);
    expect(moveLine(claim, 9, 1)).toBe(claim);
  });
});
