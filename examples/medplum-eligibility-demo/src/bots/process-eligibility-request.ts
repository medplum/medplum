import { BotEvent, getReferenceString, MedplumClient } from '@medplum/core';
import { CoverageEligibilityRequest, CoverageEligibilityResponse } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<CoverageEligibilityRequest>): Promise<void> {
  const request = event.input as CoverageEligibilityRequest;

  const response = processRequest(request);

  if (response) {
    await medplum.createResource(response);
  }
}

function processRequest(request: CoverageEligibilityRequest) {
  console.log(request);

  const coverage = request.insurance?.[0].coverage;

  if (!coverage) {
    console.log('This request has no linked coverage');
    return;
  }

  const response: CoverageEligibilityResponse = {
    resourceType: 'CoverageEligibilityResponse',
    status: 'active',
    purpose: request.purpose,
    patient: request.patient,
    created: new Date().toDateString(),
    request: {
      reference: getReferenceString(request),
    },
    outcome: 'complete',
    insurer: request.insurer,
    insurance: [
      {
        coverage,
        item: [
          {
            excluded: Math.floor(Math.random()) % 2 === 0 ? true : false,
          },
        ],
      },
    ],
  };

  return response;
}
