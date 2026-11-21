// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { Claim, Encounter } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { pinClaimEncounter } from './claimConditions';
import { applyVisitDetails, getEncounterVisitPatch, syncVisitDetails } from './visitDetails';

describe('visitDetails', () => {
  let medplum: MockClient;
  let encounter: WithId<Encounter>;

  beforeEach(async () => {
    medplum = new MockClient();
    encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: createReference(HomerSimpson),
      location: [{ location: { reference: 'Location/old' } }],
    });
  });

  const newClaim = (fields: Partial<Claim> = {}): Promise<WithId<Claim>> =>
    medplum.createResource<Claim>(
      pinClaimEncounter(
        {
          resourceType: 'Claim',
          status: 'draft',
          use: 'claim',
          created: '2026-10-02',
          type: { coding: [{ code: 'professional' }] },
          priority: { coding: [{ code: 'normal' }] },
          patient: createReference(HomerSimpson),
          provider: { reference: 'Organization/billing' },
          careTeam: [{ sequence: 1, provider: { reference: 'Practitioner/old' } }],
          facility: { reference: 'Location/old' },
          insurance: [],
          ...fields,
        },
        createReference(encounter)
      )
    );

  test('applies a practitioner, billing organization and facility to a claim', () => {
    const claim = {
      resourceType: 'Claim',
      provider: { reference: 'Practitioner/old' },
      careTeam: [{ sequence: 1, provider: { reference: 'Practitioner/old' } }],
      facility: { reference: 'Location/old' },
    } as Claim;

    const withPractitioner = applyVisitDetails(claim, { practitioner: { reference: 'Practitioner/new' } });
    expect(withPractitioner.careTeam?.[0].provider.reference).toBe('Practitioner/new');
    expect(withPractitioner.provider.reference).toBe('Practitioner/new');

    const withOrganization = applyVisitDetails(withPractitioner, {
      billingOrganization: { reference: 'Organization/1' },
    });
    expect(withOrganization.provider.reference).toBe('Organization/1');
    expect(applyVisitDetails(withOrganization, { facility: null }).facility).toBeUndefined();
    expect(applyVisitDetails(withOrganization, { billingOrganization: null }).provider.reference).toBe(
      'Practitioner/new'
    );

    // The place of service goes on every line, and clearing it takes it off them.
    const lines = { ...claim, item: [{ sequence: 1 }, { sequence: 2 }] } as Claim;
    const office = { code: '11', display: 'Office' };
    const placed = applyVisitDetails(lines, { placeOfService: office });
    expect(placed.item?.map((i) => i.locationCodeableConcept?.coding?.[0])).toEqual([office, office]);
    expect(applyVisitDetails(placed, { placeOfService: null }).item?.some((i) => i.locationCodeableConcept)).toBe(
      false
    );
  });

  test('patches only what changed on the encounter', () => {
    expect(getEncounterVisitPatch(encounter, { facility: { reference: 'Location/old' } })).toEqual([]);
    expect(getEncounterVisitPatch(encounter, { facility: null })).toEqual([{ op: 'remove', path: '/location' }]);
    expect(getEncounterVisitPatch(encounter, { practitioner: createReference(DrAliceSmith) })).toEqual([
      { op: 'add', path: '/participant', value: [{ individual: createReference(DrAliceSmith) }] },
    ]);
  });

  test('shares a change with the visit and its unsubmitted claims, leaving the caller and submitted claims alone', async () => {
    const own = await newClaim();
    const related = await newClaim();
    const submitted = await newClaim({ status: 'active' });
    await medplum.createResource({
      resourceType: 'ClaimResponse',
      status: 'active',
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      patient: createReference(HomerSimpson),
      created: '2026-10-03',
      insurer: { display: 'Aetna' },
      outcome: 'complete',
      request: { reference: getReferenceString(submitted) },
      payment: { type: { coding: [{ code: 'complete' }] }, amount: { value: 100, currency: 'USD' } },
    });
    const otherVisit = await newClaim({ extension: [] }).then((c) =>
      medplum.updateResource({ ...c, extension: undefined })
    );

    await syncVisitDetails(
      medplum,
      createReference(HomerSimpson),
      createReference(encounter),
      { facility: { reference: 'Location/new' } },
      { skipClaimId: own.id }
    );

    const facility = async (claim: WithId<Claim>): Promise<string | undefined> =>
      (await medplum.readResource('Claim', claim.id)).facility?.reference;
    expect(await facility(related)).toBe('Location/new');
    expect(await facility(own)).toBe('Location/old');
    expect(await facility(submitted)).toBe('Location/old');
    expect(await facility(otherVisit)).toBe('Location/old');
    expect((await medplum.readResource('Encounter', encounter.id)).location?.[0].location?.reference).toBe(
      'Location/new'
    );
  });
});
