// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AccessPolicy } from '@medplum/fhirtypes';

// start-block practice-care-team-policy
export const practiceCareTeamPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Practice and care-team reads',
  resource: [
    {
      resourceType: 'Patient',
      criteria: 'Patient?_compartment=%organization&_compartment=%care_team',
      readonly: true,
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%organization&_compartment=%care_team',
      readonly: true,
    },
  ],
};
// end-block practice-care-team-policy
