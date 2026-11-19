// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type {
  Bundle,
  Identifier,
  CodeableConcept,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  ServiceRequest,
} from '@medplum/fhirtypes';

/**
 * Identifier system for referrals created by this app. Each referral gets a random UUID when the user starts it,
 * so a double-click or retry finds the same referral instead of creating a second one.
 * `example.org` is a placeholder: replace it with a URL your organization controls before real use.
 */
const REFERRAL_ID_SYSTEM = 'http://example.org/fhir/referral-id';

interface ReferralInput {
  /** This referral's unique ID (a UUID created when the user starts the referral). */
  referralId: string;
  /** The patient being referred. Required by FHIR (ServiceRequest.subject is 1..1). */
  subject: Reference<Patient>;
  /** Who is sending the referral: the signed-in practitioner. */
  requester: Reference<Practitioner>;
  /**
   * Who is getting the referral: the saved PractitionerRole of the doctor that was looked up.
   */
  performer: Reference<PractitionerRole>;
  /** The specialty being referred to (the performer's primary NUCC specialty), if known. */
  specialty?: CodeableConcept;
  /** Free-text reason for the referral. */
  reason?: string;
}

/**
 * Builds a referral as a FHIR ServiceRequest. Nothing is saved.
 *
 * - status `active` + intent `order`: a released referral (Medplum referrals decision guide).
 * - `performer` points at the PractitionerRole, so the referral is to the doctor in that specialty.
 * - `code` and the reason are text only: no SNOMED or other codes are invented here.
 * @param input - Who, to whom, for which patient, and why.
 * @returns The ServiceRequest (no id).
 */
export function buildReferral(input: ReferralInput): ServiceRequest {
  const specialtyName = input.specialty?.text ?? input.specialty?.coding?.[0]?.display;
  const reason = input.reason?.trim();
  return {
    resourceType: 'ServiceRequest',
    identifier: [{ system: REFERRAL_ID_SYSTEM, value: input.referralId }],
    status: 'active',
    intent: 'order',
    code: { text: specialtyName ? `Referral to ${specialtyName}` : 'Referral' },
    subject: input.subject,
    requester: input.requester,
    performer: [input.performer],
    performerType: input.specialty,
    authoredOn: new Date().toISOString(),
    note: reason ? [{ text: reason }] : undefined,
  };
}

/**
 * Saves a referral, or returns the existing one if a referral with the same ID was already saved
 * (conditional create: `If-None-Exist: identifier=<REFERRAL_ID_SYSTEM>|<referralId>`).
 * @param medplum - The Medplum client.
 * @param referral - The ServiceRequest from buildReferral.
 * @returns The stored ServiceRequest.
 */
export async function saveReferral(medplum: MedplumClient, referral: ServiceRequest): Promise<WithId<ServiceRequest>> {
  const id = referral.identifier?.find((i) => i.system === REFERRAL_ID_SYSTEM)?.value;
  if (!id) {
    throw new Error('Referral has no referral ID');
  }
  return medplum.createResourceIfNoneExist(referral, `identifier=${REFERRAL_ID_SYSTEM}|${id}`);
}

/** Referral statuses that count as still open for the duplicate warning. */
const OPEN_REFERRAL_STATUSES = ['active', 'draft', 'on-hold'];

/**
 * Finds this patient's OPEN referrals whose recipient is the doctor with the given NPI identifier, sent by anyone.
 *
 * One search returns the patient's open ServiceRequests plus who each is to: the performer
 * (PractitionerRole or Practitioner) and, for roles, the role's Practitioner. A referral matches when that
 * Practitioner has the same NPI identifier, so it is caught whichever role or record was used to refer.
 *
 * Used only to WARN before sending. It does not prevent saving; duplicate saves are prevented separately by
 * saveReferral's conditional create.
 * @param medplum - The Medplum client.
 * @param patient - The patient chosen in the referral dialog.
 * @param doctorIdentifier - The NPI identifier of the doctor being referred to (system + value, as the bot set it).
 * @returns Matching open referrals, newest first (empty if none).
 */
export async function findOpenReferralsToDoctor(
  medplum: MedplumClient,
  patient: WithId<Patient>,
  doctorIdentifier: Identifier
): Promise<WithId<ServiceRequest>[]> {
  const bundle: Bundle = await medplum.search(
    'ServiceRequest',
    {
      subject: getReferenceString(patient),
      status: OPEN_REFERRAL_STATUSES.join(','),
      _include: 'ServiceRequest:performer',
      '_include:iterate': 'PractitionerRole:practitioner',
      _sort: '-authored',
      _count: '100',
    },
    { cache: 'no-cache' }
  );

  // Index everything returned by "ResourceType/id" so references can be followed.
  const byReference = new Map<string, Practitioner | PractitionerRole>();
  const referrals: WithId<ServiceRequest>[] = [];
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (resource?.resourceType === 'ServiceRequest' && entry.search?.mode !== 'include') {
      referrals.push(resource as WithId<ServiceRequest>);
    } else if (resource?.resourceType === 'Practitioner' || resource?.resourceType === 'PractitionerRole') {
      byReference.set(getReferenceString(resource as WithId<Practitioner | PractitionerRole>), resource);
    }
  }

  // Follow a performer reference to its Practitioner (directly, or through a PractitionerRole).
  const performerPractitioner = (reference: string | undefined): Practitioner | undefined => {
    const target = reference ? byReference.get(reference) : undefined;
    if (target?.resourceType === 'PractitionerRole') {
      const practitionerRef = target.practitioner?.reference;
      const practitioner = practitionerRef ? byReference.get(practitionerRef) : undefined;
      return practitioner?.resourceType === 'Practitioner' ? practitioner : undefined;
    }
    return target?.resourceType === 'Practitioner' ? target : undefined;
  };

  return referrals.filter((referral) =>
    referral.performer?.some((performer) =>
      performerPractitioner(performer.reference)?.identifier?.some(
        (i) => i.system === doctorIdentifier.system && i.value === doctorIdentifier.value
      )
    )
  );
}

/**
 * Returns the patients assigned to a practitioner, for the referral patient dropdown.
 *
 * "Assigned" currently means the practitioner is listed in `Patient.generalPractitioner`
 * (the patient's nominated primary care provider).
 *
 * TODO: switch to CareTeam (`CareTeam?participant=<me>`, then each team's `subject`) to support patients shared
 * by several clinicians and non-physician roles. Only this function should need to change.
 *
 * This is a convenience FILTER for the dropdown, not access control. Restricting which patients a user can read
 * must be done with a Medplum AccessPolicy on their ProjectMembership.
 * @param medplum - The Medplum client.
 * @param practitioner - The signed-in practitioner.
 * @returns The practitioner's patients, sorted by family name.
 */
export async function getMyPatients(
  medplum: MedplumClient,
  practitioner: WithId<Practitioner>
): Promise<WithId<Patient>[]> {
  return medplum.searchResources('Patient', {
    'general-practitioner': getReferenceString(practitioner),
    _sort: 'family',
    _count: '100',
  });
}
