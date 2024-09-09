import { BotEvent, getReferenceString, MedplumClient } from '@medplum/core';
import { Coding, CoverageEligibilityRequest, CoverageEligibilityResponse } from '@medplum/fhirtypes';

/**
 * This bot is designed to be executed whenever a `CoverageEligibilityRequest` is created. It will take the request and initiate an
 * insurance eligibility check process, ultimately creating a `CoverageEligibilityResponse` resource with the results. For more
 * details on insurance eligibility checks see https://www.medplum.com/docs/billing/insurance-eligibility-checks
 *
 * NOTE: This Bot only illustrates the relevant workflow. To implement the process, you will need to choose a coverage clearinghouse
 * to work with and modify the code to query that clearinghouse.
 *
 * @param medplum - MedplumClient
 * @param event - BotEvent<CoverageEligibilityRequest>
 * @returns the CoverageEligibilityResponse
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<CoverageEligibilityRequest>
): Promise<CoverageEligibilityResponse> {
  // Get the request from the input
  const request = event.input as CoverageEligibilityRequest;
  const serviceType = request.item?.[0].category?.coding?.[0];

  // Process the request. This is a dummy function that represents sending the request to a coverage clearinghouse
  const response = processRequest(request, serviceType);

  // Make sure that a response is returned
  if (!response) {
    throw new Error('Invalid request submitted.');
  }

  // If you receive a valid response, create and return `CoverageEligibilityResponse` resource
  return medplum.createResource(response);
}

function processRequest(
  request: CoverageEligibilityRequest,
  serviceType?: Coding
): CoverageEligibilityResponse | undefined {
  const coverage = request.insurance?.[0].coverage;

  // Make sure that the request has a linked coverage resource.
  if (!coverage) {
    console.log('This request has no linked coverage');
    return undefined;
  }

  // Build a response based on the request
  const response: CoverageEligibilityResponse = {
    resourceType: 'CoverageEligibilityResponse',
    status: 'active',
    purpose: request.purpose,
    patient: request.patient,
    created: new Date().toISOString(),
    request: {
      reference: getReferenceString(request),
    },
    outcome: 'complete',
    insurer: request.insurer,
    insurance: [
      {
        inforce: true,
        coverage,
        item: [
          {
            // For simplicity, this demo only provides coverage for X12 Service Type Code 30 - Plan Coverage and General Benefits.
            // For more details see https://www.medplum.com/docs/billing/insurance-eligibility-checks#use-cases
            excluded: serviceType?.code === '30',
            category: {
              coding: [serviceType || { code: '30' }],
            },
            benefit: [
              {
                type: {
                  coding: [
                    {
                      code: 'room',
                    },
                  ],
                },
                allowedString: 'shared',
              },
              {
                type: {
                  coding: [
                    {
                      code: 'benefit',
                    },
                  ],
                },
                allowedMoney: {
                  value: 600,
                  currency: 'USD',
                },
              },
            ],
          },
        ],
      },
    ],
  };

  return response;
}
