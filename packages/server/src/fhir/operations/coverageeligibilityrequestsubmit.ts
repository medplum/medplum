// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, isResource } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, CoverageEligibilityRequest } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';
import { dispatchSubmitOperation } from './utils/submit';

const ELIGIBILITY_SUBMIT_OPERATION_SETTING = 'ELIGIBILITY_SUBMIT_OPERATION';

export const operation = getOperationDefinition('CoverageEligibilityRequest', 'submit');

interface CoverageEligibilitySubmitParameters {
  readonly resource: Bundle | CoverageEligibilityRequest;
}

/**
 * Common function to handle coverage eligibility submit operations.
 *
 * Dispatches to the custom OperationDefinition named by the ELIGIBILITY_SUBMIT_OPERATION
 * project setting, passing the CoverageEligibilityRequest or Bundle resource as the request body.
 *
 * @param req - The FHIR request.
 * @param resource - The FHIR CoverageEligibilityRequest or Bundle resource to submit.
 * @returns The FHIR response from the underlying custom operation.
 */
async function handleCoverageEligibilitySubmit(
  req: FhirRequest,
  resource: Bundle | CoverageEligibilityRequest
): Promise<FhirResponse> {
  let eligibilityRequest: CoverageEligibilityRequest | undefined = undefined;
  if (isResource<CoverageEligibilityRequest>(resource, 'CoverageEligibilityRequest')) {
    eligibilityRequest = resource;
  } else if (isResource<Bundle>(resource, 'Bundle')) {
    eligibilityRequest = resource.entry?.find((e) => isResource(e.resource, 'CoverageEligibilityRequest'))?.resource as
      CoverageEligibilityRequest | undefined;
  }

  if (!eligibilityRequest) {
    return [badRequest('Eligibility submit must contain at least one CoverageEligibilityRequest resource.')];
  }

  return dispatchSubmitOperation(req, resource, 'CoverageEligibilityRequest', ELIGIBILITY_SUBMIT_OPERATION_SETTING);
}

/**
 * Handles HTTP POST requests for the instance-level CoverageEligibilityRequest $submit operation.
 *
 * Reads the coverage eligibility request from the database and dispatches it to the configured processor.
 *
 * Endpoint:
 *   [fhir base]/CoverageEligibilityRequest/{id}/$submit
 *
 * @param req - The FHIR request.
 * @returns The FHIR response from the underlying custom operation.
 */
export async function coverageEligibilitySubmitPostByIdHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const eligibilityRequestId = req.params.id;

  if (!eligibilityRequestId) {
    return [badRequest('CoverageEligibilityRequest ID is required')];
  }

  const eligibilityRequest = await repo.readResource<CoverageEligibilityRequest>(
    'CoverageEligibilityRequest',
    eligibilityRequestId
  );
  return handleCoverageEligibilitySubmit(req, eligibilityRequest);
}

/**
 * Handles HTTP POST requests for the type-level CoverageEligibilityRequest $submit operation.
 *
 * Dispatches the CoverageEligibilityRequest passed via the 'resource' input parameter to the
 * configured processor.
 *
 * Endpoint:
 *   [fhir base]/CoverageEligibilityRequest/$submit
 *
 * @param req - The FHIR request.
 * @returns The FHIR response from the underlying custom operation.
 */
export async function coverageEligibilitySubmitPostHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<CoverageEligibilitySubmitParameters>(operation, req);
  const eligibilityRequest = params.resource;
  return handleCoverageEligibilitySubmit(req, eligibilityRequest);
}
