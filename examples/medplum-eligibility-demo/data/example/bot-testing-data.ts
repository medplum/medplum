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

export const generalBenefitsCheck: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:ffadea04-eee3-4c12-9817-b6f187e6a439',
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
      fullUrl: 'urn:uuid:0b4ead56-6fa0-4725-adc8-5a1f75f4d48a',
      resource: {
        resourceType: 'Organization',
        name: 'Blue Cross Blue Shield',
      },
      request: { method: 'POST', url: 'Organization' },
    },
    {
      fullUrl: 'urn:uuid:3ee7e5cc-1b93-4f50-8018-497f9c387af4',
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
      fullUrl: 'urn:uuid:4c388f48-5f79-4d05-9331-0654853805fd',
      resource: {
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['benefits'],
        patient: {
          reference: 'urn:uuid:ffadea04-eee3-4c12-9817-b6f187e6a439',
        },
        insurer: {
          reference: 'urn:uuid:0b4ead56-6fa0-4725-adc8-5a1f75f4d48a',
        },
        created: new Date().toISOString(),
        insurance: [
          {
            coverage: {
              reference: 'urn:uuid:3ee7e5cc-1b93-4f50-8018-497f9c387af4',
            },
          },
        ],
        item: [
          {
            category: {
              coding: [
                {
                  code: '30',
                  display: 'Plan Coverage and General Benefits',
                },
              ],
            },
          },
        ],
      },
      request: { method: 'POST', url: 'CoverageEligibilityRequest' },
    },
  ],
};

export const otherEligibilityCheck: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:bd52bb54-d719-41a0-a451-6f513ba2eed2',
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
      fullUrl: 'urn:uuid:e622642a-de1d-4441-a688-eca1a5dd616a',
      resource: {
        resourceType: 'Organization',
        name: 'Blue Cross Blue Shield',
      },
      request: { method: 'POST', url: 'Organization' },
    },
    {
      fullUrl: 'urn:uuid:6cd8dfed-287e-4a7d-b56d-1c330779167d',
      resource: {
        resourceType: 'Coverage',
        status: 'active',
        beneficiary: {
          reference: 'urn:uuid:bd52bb54-d719-41a0-a451-6f513ba2eed2',
        },
        payor: [
          {
            reference: 'urn:uuid:e622642a-de1d-4441-a688-eca1a5dd616a',
          },
        ],
      },
      request: { method: 'POST', url: 'Coverage' },
    },
    {
      fullUrl: 'urn:uuid:b6a0db56-d8ad-4011-9a3b-47edd97926cc',
      resource: {
        resourceType: 'CoverageEligibilityRequest',
        status: 'active',
        purpose: ['benefits'],
        patient: {
          reference: 'urn:uuid:bd52bb54-d719-41a0-a451-6f513ba2eed2',
        },
        insurer: {
          reference: 'urn:uuid:e622642a-de1d-4441-a688-eca1a5dd616a',
        },
        created: new Date().toISOString(),
        insurance: [
          {
            coverage: {
              reference: 'urn:uuid:6cd8dfed-287e-4a7d-b56d-1c330779167d',
            },
          },
        ],
        item: [
          {
            category: {
              coding: [
                {
                  code: '93',
                  display: 'Podiatry',
                },
              ],
            },
          },
        ],
      },
      request: { method: 'POST', url: 'CoverageEligibilityRequest' },
    },
  ],
};
