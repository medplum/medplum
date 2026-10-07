// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block caseImports
import type { MedplumClient } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { CarePlan, EpisodeOfCare } from '@medplum/fhirtypes';
// end-block caseImports

// start-block createCaseTs
export async function createCase(
  medplum: MedplumClient,
  patient: EpisodeOfCare['patient'],
  organization: NonNullable<EpisodeOfCare['managingOrganization']>,
  enrollmentKey: string
): Promise<{ episode: EpisodeOfCare; plan: CarePlan }> {
  // Illustrative namespaces. Use stable identifiers from the enrollment system.
  const episodeIdentifier = { system: 'https://example.org/enrollments', value: enrollmentKey };
  const episode = await medplum.createResourceIfNoneExist<EpisodeOfCare>(
    {
      resourceType: 'EpisodeOfCare',
      identifier: [episodeIdentifier],
      status: 'active',
      patient,
      managingOrganization: organization,
    },
    new URLSearchParams({ identifier: `${episodeIdentifier.system}|${episodeIdentifier.value}` }).toString()
  );
  const planIdentifier = { system: 'https://example.org/enrollment-plans', value: enrollmentKey };
  const plan = await medplum.createResourceIfNoneExist<CarePlan>(
    {
      resourceType: 'CarePlan',
      identifier: [planIdentifier],
      status: 'active',
      intent: 'plan',
      title: 'Patient follow-up plan',
      subject: patient,
      supportingInfo: [createReference(episode)],
    },
    new URLSearchParams({ identifier: `${planIdentifier.system}|${planIdentifier.value}` }).toString()
  );
  return { episode, plan };
}
// end-block createCaseTs

// start-block findCasePlansTs
export async function findCasePlans(
  medplum: MedplumClient,
  patientReference: string,
  episodeReference: string
): Promise<CarePlan[]> {
  const matches: CarePlan[] = [];
  for await (const page of medplum.searchResourcePages('CarePlan', { patient: patientReference })) {
    for (const plan of page) {
      if (plan.supportingInfo?.some((reference) => reference.reference === episodeReference)) {
        matches.push(plan);
      }
    }
  }
  return matches;
}
// end-block findCasePlansTs
