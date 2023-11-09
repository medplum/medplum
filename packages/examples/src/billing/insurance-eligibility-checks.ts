import { CoverageEligibilityRequest, CoverageEligibilityResponse } from '@medplum/fhirtypes';

const eligibilityCheck: CoverageEligibilityRequest =
  // start-block eligibilityRequest
  {
    resourceType: 'CoverageEligibilityRequest',
    id: 'coverage-validation-request',
    status: 'active',
    purpose: ['validation'],
    patient: {
      reference: 'Patient/homer-simpson',
    },
    provider: {
      reference: 'Practitioner/dr-alice-smith',
    },
    insurer: {
      reference: 'Organization/blue-cross-blue-shield',
    },
    insurance: [
      {
        coverage: {
          reference: 'Coverage/example-coverage',
        },
      },
    ],
    item: [
      {
        category: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/ex-benefitcategory',
              code: '3',
              display: 'Consultation',
            },
          ],
        },
        productOrService: {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '80504',
              display: 'Consultation for a moderately complex clinical problem',
            },
          ],
        },
      },
    ],
  };
// end-block eligibilityRequest

const eligibilityResponse: CoverageEligibilityResponse =
  // start-block eligibilityResponse
  {
    resourceType: 'CoverageEligibilityResponse',
    status: 'active',
    purpose: ['validation'],
    patient: {
      reference: 'Patient/homer-simpson',
    },
    request: {
      reference: 'CoverageEligibilityRequest/coverage-validation-request',
    },
    outcome: 'complete',
    disposition: 'Coverage is currently in-force',
    insurer: {
      reference: 'Organization/blue-cross-blue-shield',
    },
    insurance: [
      {
        coverage: {
          reference: 'Coverage/example-coverage',
        },
        inforce: true,
        item: [
          {
            category: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/ex-benefitcategory',
                  code: '3',
                  display: 'Consultation',
                },
              ],
            },
            network: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/benefit-network',
                  code: 'in',
                },
              ],
            },
            unit: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/benefit-unit',
                  code: 'individual',
                },
              ],
            },
            term: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/benefit-term',
                  code: 'annual',
                },
              ],
            },
            benefit: [
              {
                type: {
                  coding: [
                    {
                      code: 'copay-maximum',
                    },
                  ],
                },
                allowedMoney: {
                  value: 100,
                  currency: 'USD',
                },
              },
            ],
          },
        ],
      },
    ],
  };
// end-block eligibilityResponse

console.log(eligibilityCheck, eligibilityResponse);
