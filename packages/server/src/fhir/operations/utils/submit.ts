// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../../context';
import { tryCustomOperation } from '../custom';

/**
 * Dispatches a submit-style operation to the custom OperationDefinition named by a project setting,
 * passing the given resource as the request body. The core server stays vendor-neutral: any
 * processor registers a custom OperationDefinition whose implementation is a Bot, and $submit
 * forwards to it via tryCustomOperation.
 *
 * @param req - The FHIR request.
 * @param resource - The FHIR resource (or Bundle) to forward as the sub-request body.
 * @param resourceType - The resource type used in the sub-request URL.
 * @param settingName - The project setting holding the custom operation code.
 * @returns The FHIR response from the underlying custom operation.
 */
export async function dispatchSubmitOperation(
  req: FhirRequest,
  resource: Resource,
  resourceType: ResourceType,
  settingName: string
): Promise<FhirResponse> {
  const { project, repo } = getAuthenticatedContext();

  const customOperationCode = project.setting?.find((s) => s.name === settingName)?.valueString;
  if (!customOperationCode) {
    return [badRequest(`${resourceType} submit is not configured: set the ${settingName} project setting.`)];
  }

  // Normalize to a type-level POST so tryCustomOperation forwards the resource as the body,
  // regardless of whether the original request was instance-level or type-level.
  const subRequest: FhirRequest = {
    ...req,
    method: 'POST',
    url: `/${resourceType}/$${customOperationCode}`,
    body: resource,
  };
  const result = await tryCustomOperation(subRequest, repo);
  if (!result) {
    return [
      badRequest(
        `${resourceType} submit operation is not available. No processor is configured to handle the submission.`
      ),
    ];
  }
  return result;
}
