// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, createReference } from '@medplum/core';
import type { Condition, Coverage, Encounter } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { createClaimFromEncounter, findEncounterClaim } from './newClaim';

describe('newClaim', () => {
  let medplum: MockClient;
  let coverage: WithId<Coverage>;
  let condition: WithId<Condition>;

  beforeEach(async () => {
    medplum = new MockClient();
    coverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(HomerSimpson),
      patient: createReference(HomerSimpson),
      payor: [{ display: 'Aetna' }],
    } as Coverage);
    condition = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: createReference(HomerSimpson),
      code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10', display: 'Hypertension' }] },
    });
  });

  const createEncounter = (fields: Partial<Encounter> = {}): Promise<WithId<Encounter>> =>
    medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: createReference(HomerSimpson),
      participant: [{ individual: createReference(DrAliceSmith) }],
      diagnosis: [{ condition: createReference(condition) }],
      ...fields,
    });

  test('creates a draft claim from the encounter', async () => {
    const encounter = await createEncounter();
    await medplum.createResource({
      resourceType: 'ChargeItem',
      status: 'billable',
      subject: createReference(HomerSimpson),
      context: createReference(encounter),
      code: { coding: [{ system: CPT, code: '99213', display: 'Office visit' }] },
      priceOverride: { value: 150, currency: 'USD' },
    });

    const claim = await createClaimFromEncounter(medplum, encounter);
    expect(claim).toMatchObject({
      status: 'draft',
      patient: { reference: `Patient/${HomerSimpson.id}` },
      provider: { reference: `Practitioner/${DrAliceSmith.id}` },
      insurance: [{ coverage: { reference: `Coverage/${coverage.id}` } }],
      diagnosis: [{ sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'I10' }] } }],
      total: { value: 150 },
    });
    expect(claim.item?.[0].productOrService?.coding?.[0].code).toBe('99213');
    expect((await findEncounterClaim(medplum, encounter))?.id).toBe(claim.id);
  });

  test('bills under the signed-in practitioner when the encounter has none', async () => {
    const encounter = await createEncounter({ participant: undefined, diagnosis: undefined });
    const claim = await createClaimFromEncounter(medplum, encounter);
    expect(claim.provider?.reference).toBe(`Practitioner/${medplum.getProfile()?.id}`);
    expect(claim.diagnosis).toBeUndefined();
  });

  test('requires a patient', async () => {
    const encounter = await createEncounter({ subject: { reference: 'Group/1' } });
    await expect(createClaimFromEncounter(medplum, encounter)).rejects.toThrow('The encounter has no patient');
  });
});
