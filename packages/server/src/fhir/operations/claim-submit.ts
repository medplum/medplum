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
        min: 0,
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

interface ClaimSubmitInput {
  resource?: Claim;
}

/**
 * Handles the Claim $submit operation.
 *
 * Dispatches to the custom OperationDefinition named by the CLAIM_SUBMIT_OPERATION project
 * setting, passing the Claim resource as the request body. The core server stays
 * vendor-neutral: any claim processor (Candid, Stedi, or a future vendor) registers a custom
 * OperationDefinition whose implementation is a Bot, and $submit forwards to it via
 * tryCustomOperation.
 *
 * Endpoints:
 *   POST /Claim/$submit                (Claim passed via the 'resource' input parameter)
 *   POST /Claim/:id/$submit            (Claim read from the URL)
 *
 * @param req - The FHIR request.
 * @returns The FHIR response from the underlying custom operation.
 */
export async function claimSubmitHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ClaimSubmitInput>(operation, req);
  const { project, repo } = getAuthenticatedContext();

  const customOperationCode = project.setting?.find((s) => s.name === CLAIM_SUBMIT_OPERATION_SETTING)?.valueString;
  if (!customOperationCode) {
    return [badRequest('Claim submit is not configured: set the CLAIM_SUBMIT_OPERATION project setting.')];
  }

  const claimId = (req.params as { id?: string } | undefined)?.id;
  let claim: Claim;
  if (claimId) {
    claim = await repo.readResource<Claim>('Claim', claimId);
  } else if (params.resource) {
    claim = params.resource;
  } else {
    return [badRequest("Missing Claim payload: pass the 'resource' input parameter, or POST to /Claim/:id/$submit.")];
  }

  const subRequest: FhirRequest = {
    ...req,
    url: `/Claim/$${customOperationCode}`,
    body: claim,
  };
  const result = await tryCustomOperation(subRequest, repo);
  if (!result) {
    return [badRequest('Claim submit operation is not available.')];
  }
  return result;
}
