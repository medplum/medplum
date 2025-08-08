// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { r4ProjectId } from '../constants';
import { DatabaseMode } from '../database';
import { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';

/**
 * Creates all StructureDefinition resources.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4StructureDefinitions(systemRepo: Repository): Promise<void> {
  const client = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
  await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [r4ProjectId]);

  await createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-resources.json') as Bundle);
  await createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-medplum.json') as Bundle);
  await createStructureDefinitionsForBundle(systemRepo, readJson('fhir/r4/profiles-others.json') as Bundle);
}

async function createStructureDefinitionsForBundle(
  systemRepo: Repository,
  structureDefinitions: Bundle
): Promise<void> {
  for (const entry of structureDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;

    if (resource.resourceType === 'StructureDefinition' && resource.name) {
      globalLogger.debug('StructureDefinition: ' + resource.name);
      const result = await systemRepo.createResource<StructureDefinition>({
        ...resource,
        meta: {
          ...resource.meta,
          project: r4ProjectId,
          lastUpdated: undefined,
          versionId: undefined,
        },
        text: undefined,
        differential: undefined,
      });
      globalLogger.debug('Created: ' + result.id);
    }
  }
}
