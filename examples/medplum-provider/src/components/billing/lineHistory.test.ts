// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CPT } from '@medplum/core';
import type { ChargeItem, Claim, ClaimItem, Condition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { LINE_ADDED_URL, LINE_CHARGE_ITEM_URL } from '../../utils/claims';
import { describeLineChanges, getLineChargeItemId, loadDiagnosisHistory, loadLineHistory } from './lineHistory';

const snapshot = { code: '99213', modifiers: [], units: 1, price: 100, diagnoses: ['E11.9'] };

describe('lineHistory', () => {
  test('describes each field that changed', () => {
    expect(describeLineChanges(undefined, snapshot)).toEqual(['Added CPT: 99213']);
    expect(describeLineChanges(snapshot, snapshot)).toEqual([]);
    expect(
      describeLineChanges(snapshot, {
        code: '99214',
        modifiers: ['25'],
        units: 2,
        price: 150,
        diagnoses: ['E11.9', 'I10'],
      })
    ).toEqual([
      'Changed CPT: 99213 → 99214',
      'Changed modifiers: none → 25',
      'Changed units: 1 → 2',
      'Changed price: $100.00 → $150.00',
      'Changed diagnoses: E11.9 → E11.9, I10',
    ]);
  });

  test("finds a line's charge item from its link, or on the visit from its own id", () => {
    const linked: ClaimItem = {
      sequence: 1,
      productOrService: {},
      extension: [{ url: LINE_CHARGE_ITEM_URL, valueReference: { reference: 'ChargeItem/abc' } }],
    };
    expect(getLineChargeItemId(linked, false)).toBe('abc');
    expect(getLineChargeItemId({ sequence: 1, productOrService: {}, id: 'xyz' }, true)).toBe('xyz');
    expect(getLineChargeItemId({ sequence: 1, productOrService: {}, id: 'new-1' }, true)).toBeUndefined();
    expect(getLineChargeItemId({ sequence: 1, productOrService: {}, id: 'xyz' }, false)).toBeUndefined();
  });

  test("tells a line's history from its charge item and the claim it's on, newest first", async () => {
    const medplum = new MockClient();
    const chargeItem = await medplum.createResource<ChargeItem>({
      resourceType: 'ChargeItem',
      status: 'billable',
      subject: { reference: 'Patient/123' },
      code: { coding: [{ system: CPT, code: '99213' }] },
    });
    await medplum.updateResource<ChargeItem>({ ...chargeItem, code: { coding: [{ system: CPT, code: '99214' }] } });

    const line: ClaimItem = {
      sequence: 1,
      productOrService: { coding: [{ code: '99214' }] },
      extension: [{ url: LINE_CHARGE_ITEM_URL, valueReference: { reference: `ChargeItem/${chargeItem.id}` } }],
    };
    const added: ClaimItem = {
      sequence: 2,
      productOrService: { coding: [{ code: '36415' }] },
      extension: [{ url: LINE_ADDED_URL, valueDateTime: '2026-11-17T10:00:00Z' }],
    };
    const claim = await medplum.createResource<Claim>({
      resourceType: 'Claim',
      status: 'draft',
      use: 'claim',
      type: { coding: [{ code: 'professional' }] },
      created: '2026-11-17',
      patient: { reference: 'Patient/123' },
      provider: { reference: 'Practitioner/123' },
      priority: { coding: [{ code: 'normal' }] },
      insurance: [],
      item: [line, added],
    });
    // The line moves down, which isn't a change to it, and its units go up, which is.
    await medplum.updateResource<Claim>({ ...claim, item: [{ ...added, sequence: 1 }, { ...line, sequence: 2, quantity: { value: 2 } }] });

    const history = await loadLineHistory(medplum, line, claim.id);
    expect(history.map((h) => h.changes)).toEqual([
      ['Changed units: 1 → 2'],
      ['Added to this claim'],
      ['Changed CPT: 99213 → 99214'],
      ['Added CPT: 99213'],
    ]);

    // A line added on the claim has only the claim's history.
    expect((await loadLineHistory(medplum, added, claim.id)).map((h) => h.changes)).toEqual([['Added CPT: 36415']]);
  });

  test("tells a diagnosis's history from its Condition and the claim it's on", async () => {
    const medplum = new MockClient();
    const condition = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: { reference: 'Patient/123' },
      code: { coding: [{ code: 'I10' }] },
      clinicalStatus: { coding: [{ code: 'active' }] },
    });
    await medplum.updateResource<Condition>({ ...condition, clinicalStatus: { coding: [{ code: 'resolved' }] } });
    const dx = (sequence: number, code: string): NonNullable<Claim['diagnosis']>[number] => ({
      sequence,
      diagnosisCodeableConcept: { coding: [{ code }] },
    });
    const claim = await medplum.createResource<Claim>({
      resourceType: 'Claim',
      status: 'draft',
      use: 'claim',
      type: { coding: [{ code: 'professional' }] },
      created: '2026-11-17',
      patient: { reference: 'Patient/123' },
      provider: { reference: 'Practitioner/123' },
      priority: { coding: [{ code: 'normal' }] },
      insurance: [],
      diagnosis: [dx(1, 'E11.9'), dx(2, 'I10')],
    });
    await medplum.updateResource<Claim>({ ...claim, diagnosis: [dx(1, 'I10'), dx(2, 'E11.9')] });
    await medplum.updateResource<Claim>({ ...claim, diagnosis: [dx(1, 'E11.9')] });

    const history = await loadDiagnosisHistory(medplum, 'I10', condition, claim.id);
    expect(history.map((h) => h.changes)).toEqual([
      ['Removed from this claim'],
      ['Moved: B → A'],
      ['Added to this claim as B'],
      ['Changed status: active → resolved'],
      ['Added ICD-10: I10'],
    ]);
  });
});
