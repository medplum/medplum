import { AccessPolicy } from '@medplum/fhirtypes';

export const MSO_ACCESS_POLICY: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Managed Service Organization Access Policy',
  compartment: {
    reference: '%organization'
  },
  resource: [
    {
      resourceType: 'Organization',
      readonly: true
    },
    {
      resourceType: 'Practitioner',
      readonly: true
    },
    {
      resourceType: 'PractitionerRole',
      readonly: true
    },
    {
      resourceType: 'Patient',
      readonly: true
    },
    {
      resourceType: 'Observation',
      criteria: 'Observation?_compartment=%organization'
    },
    {
      resourceType: 'DiagnosticReport',
      criteria: 'DiagnosticReport?_compartment=%organization'
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%organization'
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?_compartment=%organization'
    }
  ]
} as const; 