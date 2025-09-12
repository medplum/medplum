// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicy } from '@medplum/fhirtypes';

// This access policy allows a user to read and write to the Patient, Observation, DiagnosticReport, Encounter,
// and Communication resources if they are part of a shared healthcare service.
export const MSO_ACCESS_POLICY: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Managed Service Organization Access Policy',
  compartment: {
    reference: '%healthcare_service',
  },
  resource: [
    {
      resourceType: 'HealthcareService',
      readonly: true,
    },
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
      criteria: 'Patient?_compartment=%healthcare_service',
    },
    {
      resourceType: 'Observation',
      criteria: 'Observation?_compartment=%healthcare_service',
    },
    {
      resourceType: 'DiagnosticReport',
      criteria: 'DiagnosticReport?_compartment=%healthcare_service',
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%healthcare_service',
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?_compartment=%healthcare_service',
    },
  ],
};
