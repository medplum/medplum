// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Project, ProjectMembership } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { checkDoseSpotEnrollmentLimit, DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING } from './enrollment-utils';

/**
 * A simulated DoseSpot self-enrollment bot.
 *
 * This mirrors the structure of the real `dosespot-self-enroll-prescriber-bot`
 * (which lives in the Medplum bots repository): it counts the already-enrolled
 * clinicians in the Project, enforces the Project-level guard rail via
 * `checkDoseSpotEnrollmentLimit`, and then "calls DoseSpot" to create the
 * clinician. The DoseSpot API call is faked, but the guard rail and the
 * FHIR data flow run against a real in-memory Medplum repository (MockClient).
 */
interface SimulatedBotInput {
  /** The authenticated provider's ProjectMembership (resolved from auth/me in the real bot). */
  membership: ProjectMembership;
}

interface SimulatedBotOutput {
  status: 'created' | 'advanced';
  doseSpotClinicianId: number;
  enrolledClinicianCount: number;
  maxClinicians?: number;
}

/** How the bot tags an enrolled clinician's ProjectMembership. */
const DOSESPOT_CLINICIAN_ID_SYSTEM = 'https://dosespot.com/clinician-id';

/** Fake project id used for test memberships (MockClient accepts unresolved references). */
const TEST_PROJECT_ID = 'test-project';

async function simulatedSelfEnrollBot(
  medplum: MockClient,
  project: Pick<Project, 'systemSetting'>,
  input: SimulatedBotInput
): Promise<SimulatedBotOutput> {
  // In the real bot: medplum.searchResources('ProjectMembership', { _count: '1000' })
  const memberships = await medplum.searchResources('ProjectMembership', { _count: 1000 });
  const enrolledCount = memberships.filter((m) => m.identifier?.some((i) => i.system?.includes('dosespot'))).length;

  // The real bot re-resolves the provider's membership from auth/me on every run,
  // so it always sees fresh data (including identifiers added by previous runs).
  // Note: readResource takes the resource type name as a string literal (not the interface type).
  const membership = await medplum.readResource('ProjectMembership', input.membership.id as string);

  // Already enrolled? The bot advances the existing clinician -- the limit only applies to new clinicians.
  if (membership.identifier?.some((i) => i.system?.includes('dosespot'))) {
    return { status: 'advanced', doseSpotClinicianId: getNextClinicianId(membership), enrolledClinicianCount: enrolledCount };
  }

  // Guard rail: refuse to enroll if the Project's clinician cap has been reached.
  const check = checkDoseSpotEnrollmentLimit(project, enrolledCount);
  if (!check.allowed) {
    throw new Error(check.message);
  }

  // Fake DoseSpot API call: create the clinician.
  const doseSpotClinicianId = enrolledCount + 1;

  // Tag the membership with the DoseSpot identifier, exactly like the real bot does.
  await medplum.updateResource({
    ...membership,
    identifier: [
      ...(membership.identifier ?? []),
      { system: DOSESPOT_CLINICIAN_ID_SYSTEM, value: String(doseSpotClinicianId) },
    ],
  });

  return { status: 'created', doseSpotClinicianId, enrolledClinicianCount: enrolledCount + 1, maxClinicians: check.maxClinicians };
}

function getNextClinicianId(membership: ProjectMembership): number {
  return Number(membership.identifier?.find((i) => i.system?.includes('dosespot'))?.value ?? 0);
}

function createMembership(i: number): ProjectMembership {
  return {
    resourceType: 'ProjectMembership',
    project: { reference: `Project/${TEST_PROJECT_ID}` },
    user: { reference: `User/test-user-${i}` },
    profile: { reference: `Practitioner/test-practitioner-${i}` },
    identifier: [{ system: 'https://example.com/provider-id', value: `provider-${i}` }],
  };
}

async function createTestClient(): Promise<MockClient> {
  return new MockClient();
}

describe('simulated DoseSpot self-enrollment bot', () => {
  test('enrolls clinicians without a limit configured', async () => {
    const medplum = await createTestClient();
    const project = {}; // No systemSetting -> unlimited
    const m1 = await medplum.createResource(createMembership(1));
    const m2 = await medplum.createResource(createMembership(2));
    const m3 = await medplum.createResource(createMembership(3));

    expect((await simulatedSelfEnrollBot(medplum, project, { membership: m1 })).status).toBe('created');
    expect((await simulatedSelfEnrollBot(medplum, project, { membership: m2 })).status).toBe('created');
    expect((await simulatedSelfEnrollBot(medplum, project, { membership: m3 })).status).toBe('created');
  });

  test('stops enrolling once the configured limit is reached', async () => {
    const medplum = await createTestClient();
    const project = { systemSetting: [{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 2 }] };
    const m1 = await medplum.createResource(createMembership(1));
    const m2 = await medplum.createResource(createMembership(2));
    const m3 = await medplum.createResource(createMembership(3));

    const first = await simulatedSelfEnrollBot(medplum, project, { membership: m1 });
    expect(first).toMatchObject({ status: 'created', doseSpotClinicianId: 1, enrolledClinicianCount: 1 });

    const second = await simulatedSelfEnrollBot(medplum, project, { membership: m2 });
    expect(second).toMatchObject({ status: 'created', doseSpotClinicianId: 2, enrolledClinicianCount: 2 });

    // The third provider is over the limit -- the bot must refuse.
    await expect(simulatedSelfEnrollBot(medplum, project, { membership: m3 })).rejects.toThrow(
      /enrollment limit reached: 2 of 2 clinicians enrolled[\s\S]*dosespotMaxClinicians/
    );
  });

  test('advances an already-enrolled clinician even when the limit is reached', async () => {
    const medplum = await createTestClient();
    const project = { systemSetting: [{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 1 }] };
    const enrolled = await medplum.createResource(createMembership(1));

    await simulatedSelfEnrollBot(medplum, project, { membership: enrolled });

    // Re-running the bot for the same provider (e.g., advancing IDP/TFA stages) is always allowed.
    const result = await simulatedSelfEnrollBot(medplum, project, { membership: enrolled });
    expect(result.status).toBe('advanced');
    expect(result.doseSpotClinicianId).toBe(1);
  });
});