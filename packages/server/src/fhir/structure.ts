import { indexSearchParameterBundle, indexStructureDefinitionBundle, indexDefaultSearchParameters } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';

let loaded = false;

export function loadStructureDefinitions(): void {
  if (!loaded) {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    const resourcesBundle = readJson('fhir/r4/profiles-resources.json') as Bundle;
    indexStructureDefinitionBundle(resourcesBundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

    indexDefaultSearchParameters(resourcesBundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
    loaded = true;
  }
}
