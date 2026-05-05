// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';

const medplum = {} as MedplumClient;
const projectId = 'your-project-id';

// start-block invite-practitioner-first-membership
// First membership invite for this user in this project.
// Do NOT set forceNewMembership here.
await medplum.post(`admin/projects/${projectId}/invite`, {
  resourceType: 'Practitioner',
  firstName: 'George',
  lastName: 'Washington',
  email: 'dr.gw@example.gov',
  sendEmail: false,
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/mso-tenant-policy' },
        parameter: [{ name: 'organization', valueReference: { reference: 'Organization/clinic-a' } }],
      },
    ],
  },
});
// end-block invite-practitioner-first-membership

// start-block invite-practitioner-second-membership
// Second membership invite for the same user in the same project.
// This creates an additional ProjectMembership row with a different tenant parameter.
await medplum.post(`admin/projects/${projectId}/invite`, {
  resourceType: 'Practitioner',
  firstName: 'George',
  lastName: 'Washington',
  email: 'dr.gw@example.gov',
  sendEmail: false,
  forceNewMembership: true,
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/mso-tenant-policy' },
        parameter: [{ name: 'organization', valueReference: { reference: 'Organization/clinic-b' } }],
      },
    ],
  },
});
// end-block invite-practitioner-second-membership
