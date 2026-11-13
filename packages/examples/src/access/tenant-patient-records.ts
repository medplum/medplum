// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { InviteRequest, MedplumClient } from '@medplum/core';
import type { AccessPolicy, Patient, ProjectMembership, ProjectMembershipAccess, Reference } from '@medplum/fhirtypes';

// start-block shared-patient-encounters
export const sharedPatientEncounters: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Shared Patient, service-specific Encounters',
  resource: [
    {
      resourceType: 'Patient',
      criteria: 'Patient?_id=%patient.id',
      readonly: true,
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?patient=%patient&service-provider=%organization',
      readonly: true,
    },
  ],
};
// end-block shared-patient-encounters

// start-block shared-patient-grant
export const sharedPatientGrant: ProjectMembershipAccess = {
  policy: { reference: 'AccessPolicy/shared-patient-encounters' },
  parameter: [
    { name: 'patient', valueReference: { reference: 'Patient/shared' } },
    { name: 'organization', valueReference: { reference: 'Organization/clinic-a' } },
  ],
};
// end-block shared-patient-grant

// start-block invite-tenant-patient
export async function inviteTenantPatient(
  medplum: MedplumClient,
  projectId: string,
  identity: { firstName: string; lastName: string; email: string },
  patient: Reference<Patient>,
  profileScopedPatientPolicy: Reference<AccessPolicy>,
  additionalMembership: boolean
): Promise<ProjectMembership> {
  const invite: InviteRequest = {
    resourceType: 'Patient',
    ...identity,
    scope: 'project',
    sendEmail: false,
    forceNewMembership: additionalMembership,
    membership: {
      profile: patient,
      access: [{ policy: profileScopedPatientPolicy }],
    },
  };
  return medplum.post(`admin/projects/${projectId}/invite`, invite);
}
// end-block invite-tenant-patient
