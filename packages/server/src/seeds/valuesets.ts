// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { EMPTY, Operator } from '@medplum/core';
import { processBaseDefinitions, TERMINOLOGY_BUNDLE_FILES } from '@medplum/definitions';
import type { CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { r4ProjectId } from '../constants';
import type { Repository } from '../fhir/repo';

/**
 * Imports all built-in ValueSets and CodeSystems into the database.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4ValueSets(systemRepo: Repository): Promise<void> {
  await processBaseDefinitions(TERMINOLOGY_BUNDLE_FILES, async (entry) => {
    const resource = entry.resource as CodeSystem | ValueSet;
    await deleteExisting(systemRepo, resource, r4ProjectId);
    await systemRepo.createResource({
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
