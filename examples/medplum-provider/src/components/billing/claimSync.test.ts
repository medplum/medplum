// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, createReference } from '@medplum/core';
import type { ChargeItem, Claim, ClaimItem, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { LINE_CHARGE_ITEM_URL } from '../../utils/claims';
import { pinClaimEncounter } from './claimConditions';
import type { ChargeItemChanges } from './claimSync';
import { syncClaimLines, syncVisitClaims } from './claimSync';

const encounter: WithId<Encounter> = { resourceType: 'Encounter', id: 'enc-1', status: 'finished', class: {} };
const chargeItem = (id: string, code: string, fields: Partial<ChargeItem> = {}): WithId<ChargeItem> => ({
  resourceType: 'ChargeItem',
  id,
  status: 'billable',
  subject: { reference: 'Patient/123' },
  context: createReference(encounter),
  code: { coding: [{ system: CPT, code }] },
  priceOverride: { value: 100, currency: 'USD' },
  ...fields,
});
const lineFor = (id: string, code: string, fields: Partial<ClaimItem> = {}): ClaimItem => ({
  sequence: 1,
  productOrService: { coding: [{ system: CPT, code }] },
  quantity: { value: 1 },
  net: { value: 100, currency: 'USD' },
  extension: [{ url: LINE_CHARGE_ITEM_URL, valueReference: { reference: `ChargeItem/${id}` } }],
  ...fields,
});
const claim = (item: ClaimItem[]): Claim => ({
  resourceType: 'Claim',
  status: 'draft',
  use: 'claim',
  type: { coding: [{ code: 'professional' }] },
  created: '2026-11-17',
  patient: { reference: 'Patient/123' },
  provider: { reference: 'Practitioner/123' },
  priority: { coding: [{ code: 'normal' }] },
  insurance: [],
  item,
});
const codes = (c: Claim): (string | undefined)[] => (c.item ?? []).map((i) => i.productOrService.coding?.[0]?.code);

describe('syncClaimLines', () => {
  test('updates what the claim left alone, and keeps what it changed itself', () => {
    const before = chargeItem('a', '99213');
    const after = chargeItem('a', '99214', { priceOverride: { value: 150, currency: 'USD' } });
    const changes: ChargeItemChanges = { previous: new Map([['a', before]]), current: [after], created: new Set() };

    // The claim kept the visit's code but set its own price: the code follows the visit, the price stays.
    const synced = syncClaimLines(
      claim([lineFor('a', '99213', { net: { value: 80, currency: 'USD' } })]),
      encounter,
      changes
    );
    expect(codes(synced)).toEqual(['99214']);
    expect(synced.item?.[0].net?.value).toBe(80);

    // A payer's code set on the claim stays, while the visit's new price comes through.
    const payerCode = syncClaimLines(claim([lineFor('a', 'G0439')]), encounter, changes);
    expect(codes(payerCode)).toEqual(['G0439']);
    expect(payerCode.item?.[0].net?.value).toBe(150);
  });

  test("takes a deleted charge item's line off, leaves lines added on the claim, and adds new ones", () => {
    const changes: ChargeItemChanges = {
      previous: new Map([['a', chargeItem('a', '99213')]]),
      current: [],
      created: new Set(),
    };
    const own: ClaimItem = { sequence: 2, productOrService: { coding: [{ code: 'J1885' }] } };
    const synced = syncClaimLines(claim([lineFor('a', '99213'), own]), encounter, changes, [chargeItem('b', '36415')]);
    expect(codes(synced)).toEqual(['J1885', '36415']);
    expect(synced.item?.map((i) => i.sequence)).toEqual([1, 2]);
  });

  test('adds only the diagnoses its own lines point to', () => {
    const reason = (code: string): ChargeItem['reason'] => [{ coding: [{ code }] }];
    const before = chargeItem('a', '99213');
    const changes: ChargeItemChanges = {
      previous: new Map([['a', before]]),
      current: [{ ...before, reason: reason('E11.9') }, chargeItem('b', '36415', { reason: reason('I10') })],
      created: new Set(),
    };
    const synced = syncClaimLines(claim([lineFor('a', '99213')]), encounter, changes);
    expect(synced.diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code)).toEqual(['E11.9']);
    expect(synced.item?.[0].diagnosisSequence).toEqual([1]);
  });
});

describe('syncVisitClaims', () => {
  test("puts a new charge item on the visit's one open claim, and on none when there are several", async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    const visit = await medplum.createResource<Encounter>({ ...encounter, id: undefined });
    const onVisit = (): Claim =>
      pinClaimEncounter({ ...claim([]), patient: createReference(patient) }, createReference(visit));
    const first = await medplum.createResource(onVisit());
    const created = chargeItem('n', '36415');
    const changes: ChargeItemChanges = { previous: new Map(), current: [created], created: new Set(['n']) };

    expect(await syncVisitClaims(medplum, patient, visit, changes)).toBe(true);
    expect(codes(await medplum.readResource('Claim', first.id))).toEqual(['36415']);

    const second = await medplum.createResource(onVisit());
    const another = chargeItem('m', '85025');
    expect(
      await syncVisitClaims(medplum, patient, visit, {
        previous: new Map([['n', created]]),
        current: [created, another],
        created: new Set(['m']),
      })
    ).toBe(false);
    expect(codes(await medplum.readResource('Claim', second.id))).toEqual([]);
  });
});
