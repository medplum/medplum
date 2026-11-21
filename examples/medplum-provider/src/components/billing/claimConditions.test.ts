// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Claim, Condition, Encounter, Practitioner } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  CLINICAL_STATUSES,
  getClaimEncounter,
  getClinicalStatus,
  loadEncounterConditions,
  setClinicalStatus,
  syncEncounterDiagnoses,
} from './claimConditions';

describe('claimConditions', () => {
  let medplum: MockClient;
  let encounter: WithId<Encounter>;
  let hypertension: WithId<Condition>;

  beforeEach(async () => {
    medplum = new MockClient();
    hypertension = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10', display: 'Hypertension' }] },
      clinicalStatus: { coding: [CLINICAL_STATUSES[5]] },
    });
    encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
      diagnosis: [{ condition: { reference: getReferenceString(hypertension) }, rank: 1 }],
    });
  });

  const claim = (codes: string[]): Claim => ({
    resourceType: 'Claim',
    status: 'draft',
    use: 'claim',
    created: '2026-09-04',
    type: { coding: [{ code: 'professional' }] },
    priority: { coding: [{ code: 'normal' }] },
    provider: { reference: 'Practitioner/123' },
    patient: { reference: `Patient/${HomerSimpson.id}` },
    insurance: [],
    diagnosis: codes.map((code, i) => ({
      sequence: i + 1,
      diagnosisCodeableConcept: { coding: [{ code, display: code }] },
    })),
    item: [
      {
        sequence: 1,
        productOrService: { coding: [{ code: '99214' }] },
        encounter: [{ reference: getReferenceString(encounter) }],
      },
    ],
  });

  test('loads the visit diagnoses by code, with their status', async () => {
    expect(getClaimEncounter(claim([]))?.reference).toBe(getReferenceString(encounter));
    const byCode = await loadEncounterConditions(medplum, { reference: getReferenceString(encounter) });
    expect(getClinicalStatus(byCode.get('I10'))?.display).toBe('Resolved');
  });

  test('adds a Condition for each new claim diagnosis and lists them on the visit in claim order', async () => {
    const known = await loadEncounterConditions(medplum, { reference: getReferenceString(encounter) });
    const byCode = await syncEncounterDiagnoses(
      medplum,
      claim(['E11.9', 'I10']),
      { reference: getReferenceString(encounter) },
      known
    );

    const diabetes = byCode.get('E11.9');
    expect(getClinicalStatus(diabetes)?.code).toBe('active');
    // Who added it, for the avatar on its row.
    expect(diabetes?.recorder?.reference).toBe(getReferenceString(medplum.getProfile() as WithId<Practitioner>));
    expect(diabetes?.recordedDate).toBeDefined();
    expect(diabetes?.encounter?.reference).toBe(getReferenceString(encounter));
    const saved = await medplum.readResource('Encounter', encounter.id);
    expect(saved.diagnosis?.map((d) => [d.condition?.reference, d.rank])).toEqual([
      [getReferenceString(diabetes as WithId<Condition>), 1],
      [getReferenceString(hypertension), 2],
    ]);
  });

  test('takes a removed diagnosis off the visit but keeps its Condition', async () => {
    const known = await loadEncounterConditions(medplum, { reference: getReferenceString(encounter) });
    await syncEncounterDiagnoses(medplum, claim([]), { reference: getReferenceString(encounter) }, known);

    expect((await medplum.readResource('Encounter', encounter.id)).diagnosis).toBeUndefined();
    expect(await medplum.readResource('Condition', hypertension.id)).toBeDefined();
  });

  test('sets a Condition status', async () => {
    const updated = await setClinicalStatus(medplum, hypertension, CLINICAL_STATUSES[0]);
    expect(getClinicalStatus(updated)?.display).toBe('Active');
    expect(getClinicalStatus(undefined)).toBeUndefined();
  });

  test('a related claim adds to the visit diagnoses without removing or reordering them', async () => {
    const known = await loadEncounterConditions(medplum, { reference: getReferenceString(encounter) });
    const related = { ...claim(['E11.9']), related: [{ claim: { reference: 'Claim/visit' } }] };
    const byCode = await syncEncounterDiagnoses(medplum, related, { reference: getReferenceString(encounter) }, known);

    const saved = await medplum.readResource('Encounter', encounter.id);
    expect(saved.diagnosis?.map((d) => d.condition?.reference)).toEqual([
      getReferenceString(hypertension),
      getReferenceString(byCode.get('E11.9') as WithId<Condition>),
    ]);
  });
});
