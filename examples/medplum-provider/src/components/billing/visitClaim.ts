// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { CPT, createReference, getReferenceString } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  Condition,
  Coverage,
  Encounter,
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { BILLING_ORGANIZATION_IDENTIFIER } from '../../utils/billing';
import { getChargeItemsForEncounter } from '../../utils/chargeitems';
import { buildClaimFromEncounter } from '../../utils/claims';
import { createSelfPayCoverage, isSelfPayCoverage } from '../../utils/coverage';
import { pinClaimEncounter } from './claimConditions';

/** What a new claim for a visit is made from. Anything left out is looked up from the visit. */
export interface CreateVisitClaimArgs {
  readonly patient: WithId<Patient>;
  readonly encounter: WithId<Encounter>;
  /** The charge items the claim bills. */
  readonly chargeItems: ChargeItem[];
  /** The diagnoses; the visit's by default. */
  readonly conditions?: Condition[];
  /** The insurance to bill; the patient's primary coverage by default. */
  readonly insurance?: Reference<Coverage>[];
  /** The rendering practitioner; the visit's by default. */
  readonly practitioner?: WithId<Practitioner> | Reference<Practitioner>;
  /** The billing organization; the practitioner's by default, or null to bill as the practitioner. */
  readonly billingOrganization?: Reference<Organization> | null;
}

/**
 * Makes a claim for a visit and saves it, pinned to the visit: its charge items and diagnoses, practitioner, billing
 * organization, facility, place of service and insurance. Every claim made for a visit is made here.
 * @param medplum - The Medplum client.
 * @param args - What the claim is made from.
 * @returns The new claim.
 */
export async function createVisitClaim(medplum: MedplumClient, args: CreateVisitClaimArgs): Promise<WithId<Claim>> {
  const { patient, encounter, chargeItems } = args;
  const practitionerRef = args.practitioner
    ? createPractitionerReference(args.practitioner)
    : getVisitPractitioner(encounter);
  if (!practitionerRef) {
    throw new Error('A practitioner is required to create a claim');
  }
  const [practitioner, conditions, insurance, billingOrganization] = await Promise.all([
    args.practitioner && 'resourceType' in args.practitioner
      ? args.practitioner
      : medplum.readReference(practitionerRef),
    args.conditions ?? readVisitConditions(medplum, encounter),
    args.insurance ?? findPrimaryCoverage(medplum, patient).then((c) => [createReference(c)]),
    args.billingOrganization === undefined
      ? findBillingOrganization(medplum, practitionerRef)
      : (args.billingOrganization ?? undefined),
  ]);
  const built = buildClaimFromEncounter({
    patient,
    encounter,
    practitioner,
    chargeItems,
    conditions,
    insurance,
    billingOrganization,
  });
  return medplum.createResource(pinClaimEncounter(built, createReference(encounter)));
}

/**
 * Makes the visit's first claim when its note is signed and locked, so the visit shows up in Billing's queues. Nothing
 * is made when the visit has no charge items to bill, or already has a claim.
 * @param medplum - The Medplum client.
 * @param patient - The visit's patient.
 * @param encounter - The visit.
 * @param signer - Who signed the note; the visit's practitioner is used when it has one.
 * @returns The new claim, or undefined when none was made.
 */
export async function createVisitClaimOnSign(
  medplum: MedplumClient,
  patient: WithId<Patient>,
  encounter: WithId<Encounter>,
  signer: Reference<Practitioner>
): Promise<WithId<Claim> | undefined> {
  const [chargeItems, openClaims] = await Promise.all([
    getChargeItemsForEncounter(medplum, encounter),
    medplum.searchResources(
      'Claim',
      { encounter: getReferenceString(encounter), status: 'active,draft' },
      { cache: 'no-cache' }
    ),
  ]);
  // Once the visit has a claim, new charge items go on its claims as they're saved instead.
  if (openClaims.length) {
    return undefined;
  }
  const billable = chargeItems.filter((c) => c.code?.coding?.some((coding) => coding.system === CPT));
  if (!billable.length) {
    return undefined;
  }
  return createVisitClaim(medplum, {
    patient,
    encounter,
    chargeItems: billable,
    practitioner: getVisitPractitioner(encounter) ?? signer,
  });
}

/**
 * The patient's active coverages, newest first, with a self-pay coverage made when they have none.
 * @param medplum - The Medplum client.
 * @param patient - The patient.
 * @returns The coverages.
 */
export async function findPatientCoverages(
  medplum: MedplumClient,
  patient: WithId<Patient>
): Promise<WithId<Coverage>[]> {
  const coverages = await medplum.searchResources('Coverage', {
    patient: getReferenceString(patient),
    status: 'active',
    _sort: '-_lastUpdated',
  });
  return coverages.length ? coverages : [(await createSelfPayCoverage(medplum, patient)) as WithId<Coverage>];
}

/**
 * The coverage to bill first: the newest that isn't self-pay, else self-pay.
 * @param coverages - The patient's coverages, newest first.
 * @returns The primary coverage.
 */
export function getPrimaryCoverage(coverages: WithId<Coverage>[]): WithId<Coverage> | undefined {
  return coverages.find((c) => !isSelfPayCoverage(c)) ?? coverages[0];
}

/**
 * The billing organization on the practitioner's active PractitionerRole, as the visit's insurance check finds it.
 * @param medplum - The Medplum client.
 * @param practitioner - The practitioner.
 * @returns The billing organization, if the practitioner has one.
 */
export async function findBillingOrganization(
  medplum: MedplumClient,
  practitioner: Reference<Practitioner>
): Promise<Reference<Organization> | undefined> {
  const role = await medplum.searchOne('PractitionerRole', {
    practitioner: getReferenceString(practitioner),
    active: 'true',
    'organization.identifier': BILLING_ORGANIZATION_IDENTIFIER,
  });
  return role?.organization;
}

async function findPrimaryCoverage(medplum: MedplumClient, patient: WithId<Patient>): Promise<WithId<Coverage>> {
  return getPrimaryCoverage(await findPatientCoverages(medplum, patient)) as WithId<Coverage>;
}

function getVisitPractitioner(encounter: Encounter): Reference<Practitioner> | undefined {
  return encounter.participant?.find((p) => p.individual?.reference?.startsWith('Practitioner/'))?.individual as
    Reference<Practitioner> | undefined;
}

function createPractitionerReference(
  practitioner: WithId<Practitioner> | Reference<Practitioner>
): Reference<Practitioner> {
  return 'resourceType' in practitioner ? createReference(practitioner) : practitioner;
}

async function readVisitConditions(medplum: MedplumClient, encounter: Encounter): Promise<Condition[]> {
  const conditions = await Promise.all(
    (encounter.diagnosis ?? [])
      .map((d) => d.condition)
      .filter((ref): ref is Reference<Condition> => !!ref?.reference?.startsWith('Condition/'))
      .map((ref) => medplum.readReference(ref).catch(() => undefined))
  );
  return conditions.filter((c): c is WithId<Condition> => !!c);
}
