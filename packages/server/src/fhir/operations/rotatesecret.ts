// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, forbidden, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { ClientApplication, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { generateSecret } from '../../oauth/keys';
import { getSystemRepo } from '../repo';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

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
    { use: 'in', name: 'secret', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'retiringSecret', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'ClientApplication', min: 1, max: '1' },
  ],
};

type RotateSecretParameters = {
  secret?: string;
  retiringSecret?: string;
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
  if (!params.secret && !params.retiringSecret) {
    return [badRequest('Secret to rotate must be provided')];
  }
  if (params.secret && params.retiringSecret) {
    return [badRequest('Only one secret can be rotated at a time')];
  }

  // Patch using system repo since the secret fields should not generally be user-writeable
  const systemRepo = getSystemRepo();
  const clientApp = await systemRepo.withTransaction(async () => {
    let clientApp = await systemRepo.readResource<ClientApplication>('ClientApplication', req.params.id);
    if (params.secret && params.secret === clientApp.secret) {
      clientApp = await systemRepo.updateResource({
        ...clientApp,
        secret: generateSecret(32), // Generate new secret
        retiringSecret: clientApp.secret, // Rotate existing secret to "retiring" slot
      });
    } else if (params.retiringSecret && params.retiringSecret === clientApp.retiringSecret) {
      clientApp = await systemRepo.updateResource({
        ...clientApp,
        retiringSecret: undefined, // Remove rotated secret after it's been retired
      });
    } else {
      throw new OperationOutcomeError(badRequest('Provided secret does not match client'));
    }

    return clientApp;
  });

  return [allOk, buildOutputParameters(operation, clientApp)];
}
