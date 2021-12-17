import { IndexedStructureDefinition, indexStructureDefinition } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';

const structureDefinitions = { types: {} } as IndexedStructureDefinition;

export function getStructureDefinitions(): IndexedStructureDefinition {
  if (Object.keys(structureDefinitions.types).length === 0) {
    buildStructureDefinitions('profiles-types.json');
    buildStructureDefinitions('profiles-resources.json');
    buildStructureDefinitions('profiles-medplum.json');
  }

  return structureDefinitions;
}

function buildStructureDefinitions(fileName: string): void {
  const resourceDefinitions = readJson(`fhir/r4/${fileName}`) as Bundle;
  for (const entry of resourceDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (
      resource.resourceType === 'StructureDefinition' &&
      resource.name &&
      resource.name !== 'Resource' &&
      resource.name !== 'BackboneElement' &&
      resource.name !== 'DomainResource' &&
      resource.name !== 'MetadataResource' &&
      !isLowerCase(resource.name[0])
    ) {
      indexStructureDefinition(resource, structureDefinitions);
    }
  }
}

function isLowerCase(c: string): boolean {
  return c === c.toLowerCase();
}
