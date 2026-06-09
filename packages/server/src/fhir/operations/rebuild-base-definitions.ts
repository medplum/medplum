// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { allOk, EMPTY, forbidden, isResource, Operator } from '@medplum/core';
import {
  getDefinitionResource,
  processBaseDefinitions,
  SEARCH_PARAMETER_BUNDLE_FILES,
  STRUCTURE_DEFINITION_BUNDLE_FILES,
  TERMINOLOGY_BUNDLE_FILES,
} from '@medplum/definitions';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  BundleEntry,
  CodeSystem,
  OperationDefinition,
  Resource,
  ResourceType,
  SearchParameter,
  StructureDefinition,
  ValueSet,
} from '@medplum/fhirtypes';
import { r4ProjectId } from '../../constants';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode } from '../../database';
import { globalLogger } from '../../logger';
import type { Repository } from '../repo';
import { parseInputParameters } from './utils/parameters';

const op = getDefinitionResource<OperationDefinition>(
  'fhir/r4/profiles-medplum.json',
  'OperationDefinition',
  'https://medplum.com/fhir/OperationDefinition/rebuild-base-definitions'
);

type InputParams = {
  resourceType?: ResourceType[];
};

export async function rebuildBaseDefinitionsOperation(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  if (!repo.isSuperAdmin()) {
    return [forbidden];
  }

  const params = parseInputParameters<InputParams>(op, req);
  await rebuildBaseDefinitions(repo, params.resourceType);

  return [allOk];
}

export async function rebuildBaseDefinitions(repo: Repository, types?: ResourceType[]): Promise<void> {
  // Search Parameters
  if (types?.includes('SearchParameter') !== false) {
    const client = repo.getDatabaseClient(DatabaseMode.WRITER);
    await client.query('DELETE FROM "SearchParameter" WHERE "projectId" = $1', [r4ProjectId]);
    await processBaseDefinitions(SEARCH_PARAMETER_BUNDLE_FILES, (entry) => processSearchParameterEntry(repo, entry));
  }

  // Profile Bundles: Structure + Operation Definitions
  let importProfileBundles = false;
  if (types?.includes('StructureDefinition') !== false) {
    const client = repo.getDatabaseClient(DatabaseMode.WRITER);
    await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [r4ProjectId]);
    importProfileBundles = true;
  }
  if (types?.includes('OperationDefinition') !== false) {
    const client = repo.getDatabaseClient(DatabaseMode.WRITER);
    await client.query(`DELETE FROM "OperationDefinition" WHERE "projectId" = $1`, [r4ProjectId]);
    importProfileBundles = true;
  }
  if (importProfileBundles) {
    await processBaseDefinitions(STRUCTURE_DEFINITION_BUNDLE_FILES, async (entry) => {
      if (types?.includes(entry.resource?.resourceType as ResourceType) === false) {
        return;
      }
      if (entry.resource?.resourceType === 'StructureDefinition') {
        await processStructureDefinitionEntry(repo, entry as BundleEntry<StructureDefinition>);
      } else if (entry.resource?.resourceType === 'OperationDefinition') {
        await processOperationDefinitionEntry(repo, entry as BundleEntry<OperationDefinition>);
      }
    });
  }

  // Terminolopgy Resources: Code Systems and Value Sets
  if (types?.includes('CodeSystem') !== false || types.includes('ValueSet')) {
    await processBaseDefinitions(TERMINOLOGY_BUNDLE_FILES, async (entry) => {
      if (types?.includes(entry.resource?.resourceType as ResourceType) !== false) {
        await processTerminologyDefinitionEntry(repo, entry as BundleEntry<CodeSystem | ValueSet>);
      }
    });
  }
}

async function processSearchParameterEntry(repo: Repository, entry: BundleEntry): Promise<void> {
  if (!isResource<SearchParameter>(entry.resource, 'SearchParameter')) {
    return;
  }

  const param = entry.resource;
  globalLogger.debug('SearchParameter: ' + param.name);
  await repo.createResource<SearchParameter>(cleanSeedResource(param));
}

async function processStructureDefinitionEntry(
  repo: Repository,
  entry: BundleEntry<StructureDefinition>
): Promise<void> {
  const sd = entry.resource;
  if (!sd?.name) {
    return;
  }
  globalLogger.debug('StructureDefinition: ' + sd.name);

  try {
    const clean = cleanSeedResource(sd);
    clean.differential = undefined;
    const result = await repo.createResource<StructureDefinition>(clean);
    globalLogger.debug('Created: ' + result.id);
  } catch (error) {
    globalLogger.error('Error seeding StructureDefinition', { name: sd.name, error });
    throw error;
  }
}

async function processOperationDefinitionEntry(
  repo: Repository,
  entry: BundleEntry<OperationDefinition>
): Promise<void> {
  const op = entry.resource as OperationDefinition;
  try {
    await repo.createResource<OperationDefinition>(cleanSeedResource(op));
  } catch (error) {
    globalLogger.error('Error seeding OperationDefinition', { name: op.name, error });
    throw error;
  }
}

async function processTerminologyDefinitionEntry(
  repo: Repository,
  entry: BundleEntry<CodeSystem | ValueSet>
): Promise<void> {
  const resource = entry.resource as CodeSystem | ValueSet;
  await deleteExisting(repo, resource, r4ProjectId);
  await repo.createResource(cleanSeedResource(resource));
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

function cleanSeedResource<T extends Resource>(resource: T): T {
  return {
    ...resource,
    meta: {
      ...resource.meta,
      project: r4ProjectId,
      lastUpdated: undefined,
      versionId: undefined,
    },
    text: undefined,
  };
}
