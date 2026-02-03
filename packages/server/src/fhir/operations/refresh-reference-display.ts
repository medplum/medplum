// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getDisplayString, isResource, isResourceType, pathToJSONPointer } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, ResourceType } from '@medplum/fhirtypes';
import type { Operation } from 'rfc6902';
import { getAuthenticatedContext } from '../../context';
import { collectReferences } from '../references';
import { buildOutputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'RefreshReferenceDisplayStrings',
  status: 'active',
  kind: 'operation',
  code: 'refresh-reference-display',
  description: 'Updates the Reference.display field on any references contained in the resource',
  resource: ['Resource' as ResourceType],
  system: false,
  type: false,
  instance: true,
  parameter: [
    {
      use: 'out',
      type: 'Resource',
      name: 'return',
      min: 1,
      max: '1',
      documentation: 'The updated resource',
    },
  ],
};

export async function refreshReferenceDisplayHandler(req: FhirRequest): Promise<FhirResponse> {
  const { id, resourceType } = req.params;
  if (!id || !resourceType) {
    return [badRequest('Must specify resource type and ID')];
  }
  if (!isResourceType(resourceType)) {
    return [badRequest('Invalid resource type')];
  }

  const { repo } = getAuthenticatedContext();
  const resource = await repo.readResource(resourceType, id);

  const referenceValues = collectReferences(resource);
  const resolved = (await repo.readReferences(referenceValues.map((r) => r.value))).map((r) =>
    isResource(r) ? getDisplayString(r) : ''
  );

  const patch: Operation[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const value = resolved[i];
    if (!value) {
      continue;
    }

    const path = referenceValues[i].path;
    patch.push({ op: 'add', path: pathToJSONPointer(path) + '/display', value });
  }

  const updated = await repo.patchResource(resourceType, id, patch);
  return [allOk, buildOutputParameters(operation, updated)];
}
