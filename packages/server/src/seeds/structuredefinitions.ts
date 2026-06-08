// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isResource } from '@medplum/core';
import { processBaseDefinitions, STRUCTURE_DEFINITION_BUNDLE_FILES } from '@medplum/definitions';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { r4ProjectId } from '../constants';
import { DatabaseMode } from '../database';
import type { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';

/**
 * Creates all StructureDefinition resources.
 * @param systemRepo - The system repository to use
 */
export async function rebuildR4StructureDefinitions(systemRepo: Repository): Promise<void> {
  const client = systemRepo.getDatabaseClient(DatabaseMode.WRITER);
  await client.query(`DELETE FROM "StructureDefinition" WHERE "projectId" = $1`, [r4ProjectId]);

  await processBaseDefinitions(STRUCTURE_DEFINITION_BUNDLE_FILES, async (entry) => {
    if (!isResource<StructureDefinition>(entry.resource, 'StructureDefinition') || !entry.resource.name) {
      return;
    }
    const sd = entry.resource;
    globalLogger.debug('StructureDefinition: ' + sd.name);

    try {
      const result = await systemRepo.createResource<StructureDefinition>({
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
