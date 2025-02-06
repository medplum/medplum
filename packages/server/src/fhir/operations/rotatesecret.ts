import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { generateSecret } from '../../oauth/keys';
import { allOk, forbidden } from '@medplum/core';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { getSystemRepo } from '../repo';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'clientapplication-rotate-secret',
  status: 'active',
  kind: 'operation',
  code: 'rotate-secret',
  experimental: true,
  resource: ['ClientApplication'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    { use: 'in', name: 'secret', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'return', type: 'ClientApplication', min: 1, max: '1' },
  ],
};

type RotateSecretParameters = {
  secret: string;
};

/**
 * Handles a request to import codes and their properties into a CodeSystem.
 *
 * Endpoint - ClientApplication resource type
 *   [fhir base]/ClientApplication/:id/$rotate-secret
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function rotateSecretHandler(req: FhirRequest): Promise<FhirResponse> {
  const repo = getAuthenticatedContext().repo;
  if (!repo.isSuperAdmin() && !repo.isProjectAdmin()) {
    return [forbidden];
  }

  const params = parseInputParameters<RotateSecretParameters>(operation, req);

  // Patch using system repo since the secret fields should not generally be user-writeable
  const clientApp = await getSystemRepo().patchResource('ClientApplication', req.params.id, [
    {
      op: 'test',
      path: '/secret',
      value: params.secret,
    },
    {
      op: 'copy',
      from: '/secret',
      path: '/retiringSecret',
    },
    {
      op: 'replace',
      path: '/secret',
      value: generateSecret(32),
    },
  ]);
  return [allOk, buildOutputParameters(operation, clientApp)];
}
