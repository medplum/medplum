import {
  globalSchema,
  IndexedStructureDefinition,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  loadDataTypes,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';

let loaded = false;

export function getStructureDefinitions(): IndexedStructureDefinition {
  if (!loaded) {
    const dataTypes = readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>;
    const resourceTypes = readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>;
    const medplumTypes = readJson('fhir/r4/profiles-medplum.json') as Bundle<StructureDefinition>;
    indexStructureDefinitionBundle(dataTypes);
    indexStructureDefinitionBundle(resourceTypes);
    indexStructureDefinitionBundle(medplumTypes);
    loadDataTypes(dataTypes);
    loadDataTypes(resourceTypes);
    loadDataTypes(medplumTypes);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
    loaded = true;
  }
  return globalSchema;
}

export function getSearchParameters(resourceType: string): Record<string, SearchParameter> | undefined {
  return getStructureDefinitions().types[resourceType].searchParams;
}

export function getSearchParameter(resourceType: string, code: string): SearchParameter | undefined {
  return getSearchParameters(resourceType)?.[code];
}
