import { BotEvent, getReferenceString, MedplumClient } from '@medplum/core';
import { Coding, CoverageEligibilityRequest, CoverageEligibilityResponse } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<CoverageEligibilityRequest>): Promise<void> {
  const request = event.input as CoverageEligibilityRequest;
  const serviceType = request.item?.[0].category?.coding?.[0];

  const response = processRequest(request, serviceType);

  if (response) {
    await medplum.createResource(response);
  }
}

function processRequest(request: CoverageEligibilityRequest, serviceType?: Coding) {
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
            excluded: serviceType?.code === '30' ? true : false,
          },
        ],
      },
    ],
  };

  return response;
}
