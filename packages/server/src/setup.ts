import { Bundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { closeDatabase, initDatabase } from './database';
import { repo } from './fhir/repo';
import { Operator } from './fhir/search';

export async function main() {
  await initDatabase();

  const structureDefinitions = readJson('fhir/r4/profiles-resources.json') as Bundle;
  const entries = structureDefinitions.entry;
  if (!entries) {
    return;
  }

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }

    if (resource.resourceType === 'StructureDefinition') {
      const [searchOutcome, searchResult] = await repo.search({
        resourceType: 'StructureDefinition',
        filters: [{
          code: 'name',
          operator: Operator.EQUALS,
          value: resource.name as string
        }]
      });

      if (searchOutcome.id !== 'allok') {
        console.log(searchOutcome);
        return;
      }

      if (searchResult?.entry && searchResult.entry.length > 0) {
        // Update existing
        await repo.updateResource({
          ...resource,
          id: searchResult.entry[0].resource?.id
        });
      } else {
        // Create new
        await repo.createResource(resource);
      }
    }
  }

  await closeDatabase();
}

main();