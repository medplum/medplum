// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, createReference } from '@medplum/core';
import type { ChargeItem, Coverage, Encounter, Patient } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { createVisitClaim, createVisitClaimOnSign } from './visitClaim';

async function setup(withChargeItem = true): Promise<{
  medplum: MockClient;
  patient: WithId<Patient>;
  encounter: WithId<Encounter>;
}> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Test' }] });
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { code: 'AMB' },
    subject: createReference(patient),
    participant: [{ individual: createReference(DrAliceSmith) }],
  });
  await medplum.createResource<Coverage>({
    resourceType: 'Coverage',
    status: 'active',
    beneficiary: createReference(patient),
    payor: [{ display: 'Acme Health' }],
  });
  if (withChargeItem) {
    await medplum.createResource<ChargeItem>({
      resourceType: 'ChargeItem',
      status: 'billable',
      subject: createReference(patient),
      context: createReference(encounter),
      code: { coding: [{ system: CPT, code: '99213' }] },
      priceOverride: { value: 120, currency: 'USD' },
    });
  }
  return { medplum, patient, encounter };
}

describe('createVisitClaimOnSign', () => {
  test("makes the visit's claim from its charge items, billed to its insurance", async () => {
    const { medplum, patient, encounter } = await setup();

    const claim = await createVisitClaimOnSign(medplum, patient, encounter, createReference(DrAliceSmith));

    expect(claim?.item?.map((i) => i.productOrService.coding?.[0]?.code)).toEqual(['99213']);
    expect(claim?.insurance?.[0]?.coverage.reference).toMatch(/^Coverage\//);
    expect(claim?.careTeam?.[0]?.provider.reference).toBe(`Practitioner/${DrAliceSmith.id}`);
  });

  test('makes nothing for a visit with nothing to bill, or one that already has its claim', async () => {
    const empty = await setup(false);
    expect(
      await createVisitClaimOnSign(empty.medplum, empty.patient, empty.encounter, createReference(DrAliceSmith))
    ).toBeUndefined();

    const { medplum, patient, encounter } = await setup();
    await createVisitClaimOnSign(medplum, patient, encounter, createReference(DrAliceSmith));
    expect(await createVisitClaimOnSign(medplum, patient, encounter, createReference(DrAliceSmith))).toBeUndefined();
  });

  test('makes a claim from what the caller passes, looking up only what it leaves out', async () => {
    const { medplum, patient, encounter } = await setup();

    const claim = await createVisitClaim(medplum, {
      patient,
      encounter,
      chargeItems: [],
      conditions: [],
      insurance: [],
      billingOrganization: null,
    });

    // No billing organization means billing as the visit's practitioner.
    expect(claim.provider.reference).toBe(`Practitioner/${DrAliceSmith.id}`);
    expect(claim.insurance ?? []).toEqual([]);
    expect(claim.diagnosis).toBeUndefined();
  });
});
