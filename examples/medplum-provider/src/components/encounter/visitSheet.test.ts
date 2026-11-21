// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT } from '@medplum/core';
import type { ChargeItem, ClaimItem, Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { CHARGE_ITEM_MODIFIER_URL, CHARGE_ITEM_SEQUENCE_URL } from '../../utils/chargeitems';
import { buildClaimFromEncounter, getLineAuthor, withLineAuthor } from '../../utils/claims';
import { getClaimEncounter } from '../billing/claimConditions';
import { buildVisitSheet, lineToChargeItem, saveVisitLines } from './visitSheet';

const patient: WithId<Patient> = { resourceType: 'Patient', id: 'p1' };
const encounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'e1',
  status: 'finished',
  class: { code: 'AMB' },
  period: { start: '2026-11-01T10:00:00Z' },
};
const icd = (code: string): Condition => ({
  resourceType: 'Condition',
  subject: { reference: 'Patient/p1' },
  code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code, display: code }] },
});
const chargeItem = (id: string, code: string, extra: Partial<ChargeItem> = {}): WithId<ChargeItem> => ({
  resourceType: 'ChargeItem',
  id,
  status: 'planned',
  subject: { reference: 'Patient/p1' },
  context: { reference: 'Encounter/e1' },
  code: { coding: [{ system: CPT, code }] },
  ...extra,
});

describe('buildVisitSheet', () => {
  test('lists the diagnoses and charge items as a claim pinned to the visit, in line order', () => {
    const sheet = buildVisitSheet(
      patient,
      encounter,
      [icd('I10'), icd('E11.9'), { resourceType: 'Condition', subject: { reference: 'Patient/p1' } }],
      [
        chargeItem('b', '36415', { extension: [{ url: CHARGE_ITEM_SEQUENCE_URL, valueInteger: 2 }] }),
        chargeItem('a', '99213', {
          extension: [
            { url: CHARGE_ITEM_SEQUENCE_URL, valueInteger: 1 },
            { url: CHARGE_ITEM_MODIFIER_URL, valueCodeableConcept: { coding: [{ code: '25' }, { code: 'GT' }] } },
          ],
          quantity: { value: 2 },
          priceOverride: { value: 200, currency: 'USD' },
          reason: [{ coding: [{ code: 'E11.9' }] }],
        }),
      ]
    );

    expect(getClaimEncounter(sheet)?.reference).toBe('Encounter/e1');
    expect(sheet.diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code)).toEqual(['I10', 'E11.9']);
    expect(sheet.item?.map((i) => i.id)).toEqual(['a', 'b']);
    expect(sheet.item?.[0]).toMatchObject({
      sequence: 1,
      quantity: { value: 2 },
      net: { value: 200 },
      unitPrice: { value: 100 },
      modifier: [{ coding: [{ code: '25' }] }, { coding: [{ code: 'GT' }] }],
      diagnosisSequence: [2],
    });
    expect(sheet.item?.[1].net).toBeUndefined();
  });

  test('carries who entered each charge item onto its line, and back onto a new charge item', () => {
    const enterer = { reference: 'Practitioner/pr1' };
    const sheet = buildVisitSheet(
      patient,
      encounter,
      [],
      [chargeItem('a', '99213', { enterer, enteredDate: '2026-11-17T14:00:00Z' })]
    );
    expect(getLineAuthor(sheet.item?.[0] as ClaimItem)).toEqual({ author: enterer, added: '2026-11-17T14:00:00Z' });

    const created = lineToChargeItem(
      withLineAuthor({ sequence: 1, productOrService: { coding: [{ system: CPT, code: '90471' }] } }, enterer, 'now'),
      [],
      undefined,
      patient,
      encounter
    );
    expect(created).toMatchObject({ enterer, enteredDate: 'now' });
  });
});

describe('lineToChargeItem', () => {
  const diagnosis = [{ sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'I10' }] } }];

  test('makes a new charge item for the visit from a line', () => {
    const item = lineToChargeItem(
      {
        sequence: 3,
        productOrService: { coding: [{ system: CPT, code: '99213' }] },
        quantity: { value: 2 },
        unitPrice: { value: 50 },
        modifier: [{ coding: [{ code: '25' }] }],
        diagnosisSequence: [1],
      },
      diagnosis,
      undefined,
      patient,
      encounter
    );
    expect(item).toMatchObject({
      resourceType: 'ChargeItem',
      status: 'planned',
      subject: { reference: 'Patient/p1' },
      context: { reference: 'Encounter/e1' },
      quantity: { value: 2 },
      priceOverride: { value: 100 },
      reason: [{ coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10' }] }],
    });
    expect(item.extension).toEqual(
      expect.arrayContaining([
        { url: CHARGE_ITEM_MODIFIER_URL, valueCodeableConcept: { coding: [{ code: '25' }] } },
        { url: CHARGE_ITEM_SEQUENCE_URL, valueInteger: 3 },
      ])
    );
  });

  test("keeps a charge item's fee schedule until its code or price changes here", () => {
    const existing = chargeItem('a', '99213', {
      definitionCanonical: ['http://example.com/fee'],
      priceOverride: { value: 100 },
    });
    const line = { sequence: 1, productOrService: { coding: [{ system: CPT, code: '99213' }] }, net: { value: 100 } };
    expect(lineToChargeItem(line, [], existing, patient, encounter).definitionCanonical).toEqual([
      'http://example.com/fee',
    ]);
    expect(
      lineToChargeItem({ ...line, net: { value: 120 } }, [], existing, patient, encounter).definitionCanonical
    ).toBeUndefined();
  });
});

describe('saveVisitLines', () => {
  test('creates new coded lines, updates changed ones, and deletes removed ones', async () => {
    const medplum = new MockClient();
    const kept = await medplum.createResource(chargeItem('kept', '99213'));
    const removed = await medplum.createResource(chargeItem('removed', '36415'));
    const sheet = buildVisitSheet(patient, encounter, [], [kept]);
    sheet.item = [
      { ...(sheet.item?.[0] as ClaimItem), quantity: { value: 3 } },
      { id: 'new-1', sequence: 2, productOrService: { coding: [{ system: CPT, code: '90471' }] } },
      { id: 'new-2', sequence: 3, productOrService: {} },
    ];

    const result = await saveVisitLines(
      medplum,
      sheet,
      new Map([
        [kept.id, kept],
        [removed.id, removed],
      ]),
      patient,
      encounter
    );

    expect(result.chargeItems.map((c) => c.code.coding?.[0]?.code)).toEqual(['99213', '90471']);
    expect(result.chargeItems[0].quantity?.value).toBe(3);
    expect(result.createdIds.get('new-1')).toBe(result.chargeItems[1].id);
    await expect(medplum.readResource('ChargeItem', removed.id)).rejects.toThrow();
  });

  test('builds claim lines with units, price, modifiers and pointers from the charge items', () => {
    const claim = buildClaimFromEncounter({
      patient,
      encounter,
      practitioner: { resourceType: 'Practitioner', id: 'pr1' },
      conditions: [icd('I10'), icd('E11.9')],
      chargeItems: [
        chargeItem('a', '99213', {
          quantity: { value: 2 },
          priceOverride: { value: 200, currency: 'USD' },
          reason: [{ coding: [{ code: 'E11.9' }] }],
          extension: [{ url: CHARGE_ITEM_MODIFIER_URL, valueCodeableConcept: { coding: [{ code: '25' }] } }],
        }),
      ],
    });
    expect(claim.item?.[0]).toMatchObject({
      quantity: { value: 2 },
      net: { value: 200 },
      unitPrice: { value: 100 },
      modifier: [{ coding: [{ code: '25' }] }],
      diagnosisSequence: [2],
    });
  });
});
