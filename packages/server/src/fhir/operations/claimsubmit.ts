// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Claim } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { tryCustomOperation } from './custom';
import { makeOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const CLAIM_SUBMIT_OPERATION_SETTING = 'CLAIM_SUBMIT_OPERATION';

export const operation = makeOperationDefinition(
  { scope: 'type-and-instance', resource: 'Claim' },
  {
    name: 'claim-submit',
    code: 'submit',
    parameter: [
      {
        use: 'in',
        name: 'resource',
        type: 'Claim',
        min: 1,
        max: '1',
        documentation: 'The Claim to submit (for type-level POST).',
      },
      {
        use: 'out',
        name: 'return',
        type: 'ClaimResponse',
        min: 1,
        max: '1',
        documentation: 'The ClaimResponse returned by the underlying claim submission operation.',
      },
    ],
  }
);

interface ClaimSubmitParameters {
  readonly resource: Claim;
}

/**
 * Common function to handle claim submit operations.
 *
 * Dispatches to the custom OperationDefinition named by the CLAIM_SUBMIT_OPERATION project
 * setting, passing the Claim resource as the request body. The core server stays
 * vendor-neutral: any claim processor registers a custom OperationDefinition whose
 * implementation is a Bot, and $submit forwards to it via tryCustomOperation.
 *
 * @param req - The FHIR request.
 * @param claim - The FHIR Claim resource to submit.
 * @returns The FHIR response from the underlying custom operation.
 */
async function handleClaimSubmit(req: FhirRequest, claim: Claim): Promise<FhirResponse> {
  const { project, repo } = getAuthenticatedContext();

  const customOperationCode = project.setting?.find((s) => s.name === CLAIM_SUBMIT_OPERATION_SETTING)?.valueString;
  if (!customOperationCode) {
    return [badRequest('Claim submit is not configured: set the CLAIM_SUBMIT_OPERATION project setting.')];
  }

  // Normalize to a type-level POST so tryCustomOperation forwards the Claim as the body,
  // regardless of whether the original request was the instance-level GET or type-level POST.
  const subRequest: FhirRequest = {
    ...req,
    method: 'POST',
    url: `/Claim/$${customOperationCode}`,
    body: claim,
  };
  const result = await tryCustomOperation(subRequest, repo);
  if (!result) {
    return [
      badRequest(
        'Claim submit operation is not available. No claim processor is configured to handle claim submission.'
      ),
    ];
  }
  return result;
}

/**
 * Handles HTTP GET requests for the instance-level Claim $submit operation.
 *
 * Reads the claim from the database and dispatches it to the configured claim processor.
 *
 * Endpoint:
 *   [fhir base]/Claim/{id}/$submit
 *
 * @param req - The FHIR request.
 * @returns The FHIR response from the underlying custom operation.
 */
export async function claimSubmitGetHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const claimId = req.params.id;

  if (!claimId) {
    return [badRequest('Claim ID is required')];
  }

  const claim = await repo.readResource<Claim>('Claim', claimId);
  return handleClaimSubmit(req, claim);
}

/**
 * Handles HTTP POST requests for the type-level Claim $submit operation.
 *
 * Dispatches the Claim passed via the 'resource' input parameter to the configured claim processor.
 *
 * Endpoint:
 *   [fhir base]/Claim/$submit
 *
 * @param req - The FHIR request.
 * @returns The FHIR response from the underlying custom operation.
 */
export async function claimSubmitPostHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ClaimSubmitParameters>(operation, req);
  const claim = params.resource;

  if (!claim) {
    return [badRequest('The resource Claim is required')];
  }

  return handleClaimSubmit(req, claim);
}
