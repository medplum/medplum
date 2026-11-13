// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk } from '@medplum/core';
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

  let resource: WithId<Binary>;
  if (params.upload) {
    resource = await repo.assertCanUpdateById<Binary>('Binary', id, {
      operation: `Binary/$${operation.code}`,
      fields: ['data'],
      parameters: [{ type: 'upload', valueString: 'true' }],
    });
  } else {
    resource = await repo.readResource<Binary>('Binary', id);
  }

  const url = await getPresignedUrl(resource, params);
  return [allOk, buildOutputParameters(operation, { url })];
}
