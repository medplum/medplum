// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, getReferenceString, HTTP_TERMINOLOGY_HL7_ORG, isReference } from '@medplum/core';
import type { Claim, Condition, Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { BILLING_ORGANIZATION_IDENTIFIER } from '../../utils/billing';
import { getChargeItemsForEncounter } from '../../utils/chargeitems';
import { buildClaimFromEncounter } from '../../utils/claims';
import { isSelfPayCoverage } from '../../utils/coverage';
import { getClaimEncounter, pinClaimEncounter } from './claimConditions';

/**
 * Finds the open claim for an encounter, the same one the encounter's Billing tab edits: the visit's first claim, not a
 * related claim made from it later.
 * @param medplum - The Medplum client.
 * @param encounter - The encounter.
 * @returns The draft or active claim, if there is one.
 */
export async function findEncounterClaim(
  medplum: MedplumClient,
  encounter: Encounter
): Promise<WithId<Claim> | undefined> {
  return medplum.searchOne(
    'Claim',
    { encounter: getReferenceString(encounter), status: 'active,draft', _sort: 'created' },
    { cache: 'no-cache' }
  );
}

/**
 * Creates a draft claim from an encounter, as the encounter's Billing tab does: its charge items become the lines, its
 * diagnoses the claim's diagnoses, the patient's active coverage the insurance, and its practitioner the rendering
 * provider, billed under their billing organization when they have one.
 * @param medplum - The Medplum client.
 * @param encounter - The encounter to bill.
 * @returns The new claim.
 */
export async function createClaimFromEncounter(
  medplum: MedplumClient,
  encounter: WithId<Encounter>
): Promise<WithId<Claim>> {
  if (!encounter.subject?.reference?.startsWith('Patient/')) {
    throw new Error('The encounter has no patient');
  }
  const practitionerRef = encounter.participant?.find((p) => p.individual?.reference?.startsWith('Practitioner/'))
    ?.individual as Reference<Practitioner> | undefined;
  const practitioner = practitionerRef ? await medplum.readReference(practitionerRef) : getProfilePractitioner(medplum);
  if (!practitioner) {
    throw new Error('The encounter has no practitioner to bill under');
  }

  const conditionRefs = (encounter.diagnosis ?? [])
    .map((d) => d.condition)
    .filter((ref): ref is Reference<Condition> => isReference(ref) && !!ref.reference?.startsWith('Condition/'));

  const [patient, chargeItems, conditions, coverages, role] = await Promise.all([
    medplum.readReference(encounter.subject as Reference<Patient>),
    getChargeItemsForEncounter(medplum, encounter),
    Promise.all(conditionRefs.map((ref) => medplum.readReference(ref))),
    medplum.searchResources('Coverage', {
      patient: encounter.subject.reference,
      status: 'active',
      _sort: '-_lastUpdated',
    }),
    medplum.searchOne('PractitionerRole', {
      practitioner: getReferenceString(practitioner),
      active: 'true',
      'organization.identifier': BILLING_ORGANIZATION_IDENTIFIER,
    }),
  ]);
  const coverage = coverages.find((c) => !isSelfPayCoverage(c)) ?? coverages[0];

  return medplum.createResource(
    pinClaimEncounter(
      buildClaimFromEncounter({
        patient,
        encounter,
        practitioner,
        chargeItems,
        conditions,
        insurance: coverage ? [createReference(coverage)] : undefined,
        billingOrganization: role?.organization,
      }),
      createReference(encounter)
    )
  );
}

/**
 * Creates another claim for a visit that already has one, leaving the visit's claim as it is. The new claim shares the
 * visit's details (patient, providers, facility, insurance and diagnoses), starts with no service lines, stays pinned
 * to the visit, and links back to the visit's claim as an associated claim.
 * @param medplum - The Medplum client.
 * @param visitClaim - The visit's claim.
 * @param visit - The visit's encounter. The visit's claim is pinned to it too, in case it has no lines to say so.
 * @returns The new claim.
 */
export async function createRelatedClaim(
  medplum: MedplumClient,
  visitClaim: WithId<Claim>,
  visit?: Reference<Encounter>
): Promise<WithId<Claim>> {
  const encounter = visit ?? getClaimEncounter(visitClaim);
  if (encounter && getClaimEncounter(visitClaim)?.reference !== encounter.reference) {
    await medplum.updateResource(pinClaimEncounter(visitClaim, encounter));
  }
  return medplum.createResource(
    pinClaimEncounter(
      {
        resourceType: 'Claim',
        status: 'draft',
        use: visitClaim.use,
        type: visitClaim.type,
        priority: visitClaim.priority,
        created: new Date().toISOString(),
        patient: visitClaim.patient,
        provider: visitClaim.provider,
        careTeam: visitClaim.careTeam,
        facility: visitClaim.facility,
        insurer: visitClaim.insurer,
        insurance: visitClaim.insurance,
        billablePeriod: visitClaim.billablePeriod,
        diagnosis: visitClaim.diagnosis,
        related: [
          {
            claim: createReference(visitClaim),
            relationship: {
              coding: [
                {
                  system: `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/ex-relatedclaimrelationship`,
                  code: 'associated',
                  display: 'Associated Claim',
                },
              ],
            },
          },
        ],
        total: { value: 0, currency: visitClaim.total?.currency ?? 'USD' },
      },
      encounter
    )
  );
}

function getProfilePractitioner(medplum: MedplumClient): WithId<Practitioner> | undefined {
  const profile = medplum.getProfile();
  return profile?.resourceType === 'Practitioner' ? (profile as WithId<Practitioner>) : undefined;
}
