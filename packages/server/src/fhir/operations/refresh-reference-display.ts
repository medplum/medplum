// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedValueWithPath } from '@medplum/core';
import { allOk, badRequest, getDisplayString, isResourceType, pathToJSONPointer } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Operation } from 'rfc6902';
import { getAuthenticatedContext } from '../../context';
import { collectReferences } from '../references';

export async function refreshReferenceDisplayHandler(req: FhirRequest): Promise<FhirResponse> {
  const { id, resourceType } = req.params;
  if (!id || !resourceType) {
    return [badRequest('Must specify resource type and ID')];
  }
  if (!isResourceType(resourceType)) {
    return [badRequest('Invalid resource type')];
  }

  const { repo } = getAuthenticatedContext();
  const updated = await repo.ensureInTransaction(async (txRepo) => {
    const resource = await txRepo.readResource(resourceType, id);

    const referenceMap = collectReferences(resource);
    const references: TypedValueWithPath[] = [];
    for (const path of Object.keys(referenceMap)) {
      references.push(...referenceMap[path]);
    }
    const resolved = await txRepo.readReferences(references.map((r) => r.value));

    const patch: Operation[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const resource = resolved[i];
      if (resource instanceof Error) {
        continue;
      }

      const path = pathToJSONPointer(references[i].path) + '/display';
      const value = getDisplayString(resource);
      patch.push({ op: 'add', path, value });
    }

    return txRepo.patchResource(resourceType, id, patch);
  });

  return [allOk, updated];
}
