import {
  globalSchema,
  IndexedStructureDefinition,
  indexSearchParameter,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, SearchParameter } from '@medplum/fhirtypes';

let loaded = false;

export function getStructureDefinitions(): IndexedStructureDefinition {
  if (!loaded) {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    buildSearchParameters();
    loaded = true;
  }
  return globalSchema;
}

export function getSearchParameters(resourceType: string): Record<string, SearchParameter> | undefined {
  return getStructureDefinitions().types[resourceType]?.searchParams;
}

export function getSearchParameter(resourceType: string, code: string): SearchParameter | undefined {
  return getSearchParameters(resourceType)?.[code];
}

function buildSearchParameters(): void {
  const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>;
  for (const entry of searchParams.entry as BundleEntry<SearchParameter>[]) {
    indexSearchParameter(entry.resource as SearchParameter);
  }
}
