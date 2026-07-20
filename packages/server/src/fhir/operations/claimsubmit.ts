// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, isResource } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, Claim } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { tryCustomOperation } from './custom';
import { getOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const CLAIM_SUBMIT_OPERATION_SETTING = 'CLAIM_SUBMIT_OPERATION';
const PRIOR_AUTH_SUBMIT_OPERATION_SETTING = 'PRIOR_AUTH_SUBMIT_OPERATION';

export const operation = getOperationDefinition('Claim', 'submit');

interface ClaimSubmitParameters {
  readonly resource: Bundle | Claim;
}

/**
 * Common function to handle claim submit operations.
 *
 * Dispatches to the custom OperationDefinition named by the relevant project setting,
 * passing the Claim or Bundle resource as the request body. The core server stays
 * vendor-neutral: any claim processor registers a custom OperationDefinition whose
 * implementation is a Bot, and $submit forwards to it via tryCustomOperation.
 *
 * @param req - The FHIR request.
 * @param resource - The FHIR Claim or Bundle resource to submit.
 * @returns The FHIR response from the underlying custom operation.
 */
async function handleClaimSubmit(req: FhirRequest, resource: Bundle | Claim): Promise<FhirResponse> {
  const { project, repo } = getAuthenticatedContext();

  let claim: Claim | undefined = undefined;
  if (isResource<Claim>(resource, 'Claim')) {
    claim = resource;
  } else if (isResource<Bundle>(resource, 'Bundle')) {
    claim = resource.entry?.find((e) => isResource(e.resource, 'Claim'))?.resource as Claim | undefined;
  }

  if (!claim) {
    return [badRequest('Claim submit must contain at least one Claim resource.')];
  }

  const operationSetting =
    claim.use === 'preauthorization' ? PRIOR_AUTH_SUBMIT_OPERATION_SETTING : CLAIM_SUBMIT_OPERATION_SETTING;

  const customOperationCode = project.setting?.find((s) => s.name === operationSetting)?.valueString;
  if (!customOperationCode) {
    return [badRequest(`Claim submit is not configured: set the ${operationSetting} project setting.`)];
  }

  // Normalize to a type-level POST so tryCustomOperation forwards the Claim or Bundle as the body,
  // regardless of whether the original request was instance-level or type-level.
  const subRequest: FhirRequest = {
    ...req,
    method: 'POST',
    url: `/Claim/$${customOperationCode}`,
    body: resource,
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
 * Handles HTTP POST requests for the instance-level Claim $submit operation.
 *
 * Reads the claim from the database and dispatches it to the configured claim processor.
 *
 * Endpoint:
 *   [fhir base]/Claim/{id}/$submit
 *
 * @param req - The FHIR request.
 * @returns The FHIR response from the underlying custom operation.
 */
export async function claimSubmitPostByIdHandler(req: FhirRequest): Promise<FhirResponse> {
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
  return handleClaimSubmit(req, claim);
}
