// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { allOk, EMPTY, isResource, Operator } from '@medplum/core';
import {
  getDefinitionResource,
  readJsonAsync,
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
import { requireSuperAdmin } from '../../admin/super';
import { r4ProjectId } from '../../constants';
import { globalLogger } from '../../logger';
import type { Repository, SystemRepository } from '../repo';
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
  const { repo } = requireSuperAdmin();

  const params = parseInputParameters<InputParams>(op, req);
  await rebuildBaseDefinitions(repo, params.resourceType);

  return [allOk];
}

export async function rebuildBaseDefinitions(repo: Repository, types?: ResourceType[]): Promise<void> {
  // Search Parameters
  if (shouldProcessType(types, 'SearchParameter')) {
    await processBaseDefinitions(SEARCH_PARAMETER_BUNDLE_FILES, (entry) => processSearchParameterEntry(repo, entry));
  }

  // Profile Bundles: Structure + Operation Definitions
  if (shouldProcessType(types, 'StructureDefinition') || shouldProcessType(types, 'OperationDefinition')) {
    await processBaseDefinitions(STRUCTURE_DEFINITION_BUNDLE_FILES, async (entry) => {
      if (!shouldProcessType(types, entry.resource?.resourceType as ResourceType)) {
        return;
      }
      if (entry.resource?.resourceType === 'StructureDefinition') {
        await processStructureDefinitionEntry(repo, entry as BundleEntry<StructureDefinition>);
      } else if (entry.resource?.resourceType === 'OperationDefinition') {
        await processOperationDefinitionEntry(repo, entry as BundleEntry<OperationDefinition>);
      }
    });
  }

  // Terminology Resources: Code Systems and Value Sets
  if (shouldProcessType(types, 'CodeSystem') || shouldProcessType(types, 'ValueSet')) {
    await processBaseDefinitions(TERMINOLOGY_BUNDLE_FILES, async (entry) => {
      if (shouldProcessType(types, entry.resource?.resourceType as ResourceType)) {
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
  await replaceExisting(repo, param, r4ProjectId);
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
    const result = await replaceExisting(repo, sd, r4ProjectId);
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
    await replaceExisting(repo, op, r4ProjectId);
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
  await replaceExisting(repo, resource, r4ProjectId);
}

async function replaceExisting<T extends Resource & { url?: string }>(
  systemRepo: SystemRepository,
  resource: T,
  projectId: string
): Promise<WithId<T>> {
  return systemRepo.withTransaction(async () => {
    const bundle = await systemRepo.search({
      resourceType: resource.resourceType,
      filters: [
        { code: 'url', operator: Operator.EQUALS, value: resource.url as string },
        { code: '_project', operator: Operator.EQUALS, value: projectId },
      ],
    });
    for (const entry of bundle.entry ?? EMPTY) {
      const existing = entry.resource as WithId<T>;
      await systemRepo.deleteResource(existing.resourceType, existing.id);
    }
    return systemRepo.createResource(cleanSeedResource(resource));
  });
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
    differential: undefined,
  };
}

async function processBaseDefinitions(files: string[], callback: (entry: BundleEntry) => Promise<void>): Promise<void> {
  for (const filename of files) {
    const bundle = await readJsonAsync(filename);
    for (const entry of bundle.entry ?? EMPTY) {
      await callback(entry);
    }
  }
}

/**
 * Check if a given type should be rebuilt; if no types are specifed, then any are included.
 * @param types - The list of types to include, or `undefined` for all types
 * @param target  - The type to check for inclusion
 * @returns Whether the type should be rebuilt.
 */
function shouldProcessType(types: ResourceType[] | undefined, target: ResourceType): boolean {
  return types?.includes(target) !== false;
}
