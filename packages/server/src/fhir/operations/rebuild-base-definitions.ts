// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { allOk, EMPTY, forbidden, isResource, Operator } from '@medplum/core';
import {
  processBaseDefinitions,
  SEARCH_PARAMETER_BUNDLE_FILES,
  STRUCTURE_DEFINITION_BUNDLE_FILES,
  TERMINOLOGY_BUNDLE_FILES,
} from '@medplum/definitions';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { CodeSystem, ResourceType, SearchParameter, StructureDefinition, ValueSet } from '@medplum/fhirtypes';
import { r4ProjectId } from '../../constants';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode } from '../../database';
import { globalLogger } from '../../logger';
import type { Repository } from '../repo';

export async function rebuildBaseDefinitionsOperation(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  if (!repo.isSuperAdmin()) {
    return [forbidden];
  }

  return [allOk];
}

export async function rebuildBaseDefinitions(repo: Repository, types: ResourceType[]): Promise<void> {
  if (types.includes('SearchParameter')) {
    const client = repo.getDatabaseClient(DatabaseMode.WRITER);
    await client.query('DELETE FROM "SearchParameter" WHERE "projectId" = $1', [r4ProjectId]);
    await processBaseDefinitions(SEARCH_PARAMETER_BUNDLE_FILES, async (entry) => {
      if (!isResource<SearchParameter>(entry.resource, 'SearchParameter')) {
        return;
      }

      const param = entry.resource;
      globalLogger.debug('SearchParameter: ' + param.name);
      await repo.createResource<SearchParameter>({
        ...param,
        meta: {
          ...param.meta,
          project: r4ProjectId,
          lastUpdated: undefined,
          versionId: undefined,
        },
        text: undefined,
      });
    });
  }
  if (types.includes('StructureDefinition')) {
    const client = repo.getDatabaseClient(DatabaseMode.WRITER);
    await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [r4ProjectId]);

    await processBaseDefinitions(STRUCTURE_DEFINITION_BUNDLE_FILES, async (entry) => {
      if (!isResource<StructureDefinition>(entry.resource, 'StructureDefinition') || !entry.resource.name) {
        return;
      }
      const sd = entry.resource;
      globalLogger.debug('StructureDefinition: ' + sd.name);

      try {
        const result = await repo.createResource<StructureDefinition>({
          ...sd,
          meta: {
            ...sd.meta,
            project: r4ProjectId,
            lastUpdated: undefined,
            versionId: undefined,
          },
          text: undefined,
          differential: undefined,
        });
        globalLogger.debug('Created: ' + result.id);
      } catch (error) {
        globalLogger.error('Error seeding StructureDefinition', { name: sd.name, error });
        throw error;
      }
    });
  }
  if (types.includes('CodeSystem') || types.includes('ValueSet')) {
    await processBaseDefinitions(TERMINOLOGY_BUNDLE_FILES, async (entry) => {
      const resource = entry.resource as CodeSystem | ValueSet;
      await deleteExisting(repo, resource, r4ProjectId);
      await repo.createResource({
        ...resource,
        meta: {
          ...resource.meta,
          project: r4ProjectId,
          lastUpdated: undefined,
          versionId: undefined,
        },
      });
    });
  }
}

async function deleteExisting(
  systemRepo: Repository,
  resource: CodeSystem | ValueSet,
  projectId: string
): Promise<void> {
  const bundle = await systemRepo.search({
    resourceType: resource.resourceType,
    filters: [
      { code: 'url', operator: Operator.EQUALS, value: resource.url as string },
      { code: '_project', operator: Operator.EQUALS, value: projectId },
    ],
  });
  for (const entry of bundle.entry ?? EMPTY) {
    const existing = entry.resource as WithId<CodeSystem | ValueSet>;
    await systemRepo.deleteResource(existing.resourceType, existing.id);
  }
}
