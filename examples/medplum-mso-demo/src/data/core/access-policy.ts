// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicy } from '@medplum/fhirtypes';

// This access policy allows a user to read and write to the Patient, Observation, DiagnosticReport, Encounter,
// and Communication resources if they are part of a shared organization.
export const MSO_ACCESS_POLICY: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Managed Service Organization Access Policy',
  compartment: {
    reference: '%organization',
  },
  resource: [
    {
      resourceType: 'Organization',
      readonly: true,
    },
    {
      resourceType: 'Practitioner',
      readonly: true,
    },
    {
      resourceType: 'PractitionerRole',
      readonly: true,
    },
    {
      resourceType: 'Patient',
      criteria: 'Patient?_compartment=%organization',
    },
    {
      resourceType: 'Observation',
      criteria: 'Observation?_compartment=%organization',
    },
    {
      resourceType: 'DiagnosticReport',
      criteria: 'DiagnosticReport?_compartment=%organization',
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%organization',
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?_compartment=%organization',
    },
  ],
};
