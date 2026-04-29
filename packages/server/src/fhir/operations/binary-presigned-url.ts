// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicyInteraction, allOk, forbidden, OperationOutcomeError, satisfiedAccessPolicy } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPresignedUrl } from '../../storage/loader';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'BinaryPresignedURL',
  status: 'active',
  kind: 'operation',
  code: 'presigned-url',
  experimental: true,
  resource: ['Binary'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    { use: 'in', name: 'upload', type: 'boolean', min: 0, max: '1' },
    { use: 'out', name: 'url', type: 'uri', min: 1, max: '1' },
  ],
};

type PresignedUrlParams = {
  upload?: boolean;
};

export async function binaryPresignedUrlHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const id = req.params.id;
  const params = parseInputParameters<PresignedUrlParams>(operation, req);

  const resource = await repo.readResource<Binary>('Binary', id);
  if (params.upload && !satisfiedAccessPolicy(resource, AccessPolicyInteraction.UPDATE, repo.effectiveAccessPolicy())) {
    throw new OperationOutcomeError(forbidden);
  }

  const url = await getPresignedUrl(resource, params);
  return [allOk, buildOutputParameters(operation, { url })];
}
