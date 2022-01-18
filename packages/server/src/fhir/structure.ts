import {
  createSchema,
  IndexedStructureDefinition,
  indexSearchParameter,
  indexStructureDefinition,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, SearchParameter } from '@medplum/fhirtypes';

const schema = createSchema();

export function getStructureDefinitions(): IndexedStructureDefinition {
  if (Object.keys(schema.types).length === 0) {
    buildStructureDefinitions('profiles-types.json');
    buildStructureDefinitions('profiles-resources.json');
    buildStructureDefinitions('profiles-medplum.json');
    buildSearchParameters();
  }

  return schema;
}

export function getSearchParameters(resourceType: string): Record<string, SearchParameter> | undefined {
  return getStructureDefinitions().types[resourceType]?.searchParams;
}

export function getSearchParameter(resourceType: string, code: string): SearchParameter | undefined {
  return getSearchParameters(resourceType)?.[code];
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
      indexStructureDefinition(schema, resource);
    }
  }
}

function buildSearchParameters(): void {
  const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>;
  for (const entry of searchParams.entry as BundleEntry<SearchParameter>[]) {
    indexSearchParameter(schema, entry.resource as SearchParameter);
  }
}

function isLowerCase(c: string): boolean {
  return c === c.toLowerCase();
}
