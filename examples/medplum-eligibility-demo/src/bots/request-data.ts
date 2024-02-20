import { Bundle } from '@medplum/fhirtypes';

export const requestData: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:026198ab-badd-4e7c-a9b4-8476d3c2d321',
      resource: {
        resourceType: 'Patient',
        name: [
          {
            family: 'Simpson',
            given: ['Homer'],
          },
        ],
      },
      request: { method: 'POST', url: 'Patient' },
    },
    {
      fullUrl: 'urn:uuid:e5b0da87-6fcd-4668-8a9c-f94bb7638587',
      resource: {
        resourceType: 'Organization',
        name: 'Blue Cross Blue Shield',
      },
      request: { method: 'POST', url: 'Organization' },
    },
    {
      fullUrl: 'urn:uuid:a23391f5-822a-4b14-81b8-b29de9bac2b2',
      resource: {
        resourceType: 'Coverage',
        status: 'active',
        beneficiary: {
          reference: 'urn:uuid:026198ab-badd-4e7c-a9b4-8476d3c2d321',
        },
        payor: [
          {
            reference: 'urn:uuid:e5b0da87-6fcd-4668-8a9c-f94bb7638587',
          },
        ],
      },
      request: { method: 'POST', url: 'Coverage' },
    },
    {
      fullUrl: 'urn:uuid:6c42a29a-d433-4bd3-a606-a19ce1fbacfa',
      resource: {
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['discovery'],
        patient: {
          reference: 'urn:uuid:026198ab-badd-4e7c-a9b4-8476d3c2d321',
        },
        created: new Date().toISOString(),
        insurer: {
          reference: 'urn:uuid:a23391f5-822a-4b14-81b8-b29de9bac2b2',
        },
        insurance: [
          {
            coverage: {
              reference: 'urn:uuid:a23391f5-822a-4b14-81b8-b29de9bac2b2',
            },
          },
        ],
      },
      request: { method: 'POST', url: 'CoverageEligibilityRequest' },
    },
  ],
};

export const requestWithNoCoverage: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:026198ab-badd-4e7c-a9b4-8476d3c2d321',
      resource: {
        resourceType: 'Patient',
        name: [
          {
            family: 'Simpson',
            given: ['Homer'],
          },
        ],
      },
      request: { method: 'POST', url: 'Patient' },
    },
    {
      fullUrl: 'urn:uuid:e5b0da87-6fcd-4668-8a9c-f94bb7638587',
      resource: {
        resourceType: 'Organization',
        name: 'Blue Cross Blue Shield',
      },
      request: { method: 'POST', url: 'Organization' },
    },
    {
      fullUrl: 'urn:uuid:a23391f5-822a-4b14-81b8-b29de9bac2b2',
      resource: {
        resourceType: 'Coverage',
        status: 'active',
        beneficiary: {
          reference: 'urn:uuid:026198ab-badd-4e7c-a9b4-8476d3c2d321',
        },
        payor: [
          {
            reference: 'urn:uuid:e5b0da87-6fcd-4668-8a9c-f94bb7638587',
          },
        ],
      },
      request: { method: 'POST', url: 'Coverage' },
    },
    {
      fullUrl: 'urn:uuid:6c42a29a-d433-4bd3-a606-a19ce1fbacfa',
      resource: {
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['discovery'],
        patient: {
          reference: 'urn:uuid:026198ab-badd-4e7c-a9b4-8476d3c2d321',
        },
        created: new Date().toISOString(),
        insurer: {
          reference: 'urn:uuid:a23391f5-822a-4b14-81b8-b29de9bac2b2',
        },
      },
      request: { method: 'POST', url: 'CoverageEligibilityRequest' },
    },
  ],
};
