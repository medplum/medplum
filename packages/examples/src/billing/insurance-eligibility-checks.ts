import { CoverageEligibilityRequest, CoverageEligibilityResponse } from '@medplum/fhirtypes';

const eligibilityCheck: CoverageEligibilityRequest =
  // start-block eligibilityRequest
  {
    resourceType: 'CoverageEligibilityRequest',
    id: 'coverage-validation-request',
    status: 'active',
    purpose: ['validation'],
    created: '2021-01-01T00:00:00.000Z',
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
          reference: 'Coverage/homer-simpson-coverage',
        },
      },
    ],
    item: [
      {
        category: {
          coding: [
            {
              system: 'https://x12.org/codes/service-type-codes',
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

const generalBenefitsCheckRequest: CoverageEligibilityRequest =
  // start-block generalBenefitsCheckRequest
  {
    resourceType: 'CoverageEligibilityRequest',
    id: 'general-benefits-check',
    status: 'active',
    purpose: ['benefits', 'discovery'],
    created: '2021-01-01T00:00:00.000Z',
    patient: {
      reference: 'Patient/jane-doe',
    },
    provider: {
      reference: 'Organization/example-hospital',
    },
    insurer: {
      reference: 'Organization/kaiser-permanente',
    },
    insurance: [
      {
        coverage: {
          reference: 'Coverage/jane-doe-coverage',
        },
      },
    ],
    item: [
      {
        category: {
          coding: [
            {
              system: 'https://x12.org/codes/service-type-codes',
              code: '30',
              display: 'Plan Coverage and General Benefits',
            },
          ],
        },
      },
    ],
  };
// end-block generalBenefitsCheckRequest

const eligibilityResponse: CoverageEligibilityResponse =
  // start-block eligibilityResponse
  {
    resourceType: 'CoverageEligibilityResponse',
    status: 'active',
    purpose: ['validation'],
    created: '2021-01-01T00:00:00.000Z',
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
          reference: 'Coverage/homer-simpson-coverage',
        },
        inforce: true,
        item: [
          {
            category: {
              coding: [
                {
                  system: 'https://x12.org/codes/service-type-codes',
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

const generalBenefitsCheckResponse: CoverageEligibilityResponse =
  // start-block generalBenefitsCheckResponse
  {
    resourceType: 'CoverageEligibilityResponse',
    status: 'active',
    purpose: ['benefits', 'discovery'],
    created: '2021-01-01T00:00:00.000Z',
    patient: {
      reference: 'Patient/jane-doe',
    },
    request: {
      reference: 'CoverageEligibilityRequest/general-benefits-check',
    },
    outcome: 'complete',
    disposition: 'Coverage is currently in-force',
    insurer: {
      reference: 'Organization/kaiser-permanente',
    },
    insurance: [
      {
        coverage: {
          reference: 'Coverage/jane-doe-coverage',
        },
        inforce: true,
        item: [
          {
            category: {
              coding: [
                {
                  system: 'https://x12.org/codes/service-type-codes',
                  code: '30',
                  display: 'Plan Coverage and General Benefits',
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
                  code: 'family',
                },
              ],
            },
            term: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/benefit-term',
                  code: 'lifetime',
                },
              ],
            },
            benefit: [
              {
                type: {
                  coding: [
                    {
                      code: 'benefit',
                    },
                  ],
                },
                allowedMoney: {
                  value: 100000,
                  currency: 'USD',
                },
                usedMoney: {
                  value: 1233.4,
                  currency: 'USD',
                },
              },
              {
                type: {
                  coding: [
                    {
                      code: 'copay-percent',
                    },
                  ],
                },
                allowedUnsignedInt: 20,
              },
            ],
          },
        ],
      },
    ],
  };
// end-block generalBenefitsCheckResponse

console.log(eligibilityCheck, generalBenefitsCheckRequest, eligibilityResponse, generalBenefitsCheckResponse);
