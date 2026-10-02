// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicyInteraction, allOk } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPresignedUrl } from '../../storage/loader';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'instance', resource: 'Binary' },
  {
    name: 'BinaryPresignedURL',
    code: 'presigned-url',
    parameter: [
      { use: 'in', name: 'upload', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'url', type: 'uri', min: 1, max: '1' },
    ],
  }
);

type PresignedUrlParams = {
  upload?: boolean;
};

export async function binaryPresignedUrlHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const id = req.params.id;
  const params = parseInputParameters<PresignedUrlParams>(operation, req);

  // Extended mode keeps meta.project, which the presigned URL needs for its Project parameter
  const resource = await repo.withOverrideConfig({ extendedMode: true }).readResource<Binary>('Binary', id, {
    requireInteraction: params.upload ? AccessPolicyInteraction.UPDATE : undefined,
  });

  const url = await getPresignedUrl(resource, params);
  return [allOk, buildOutputParameters(operation, { url })];
}
