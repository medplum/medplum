// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { EMPTY, indexSearchParameter, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, SearchParameter } from '@medplum/fhirtypes';
import type { MedplumServerConfig } from '../config/types';

let loaded = false;

export function loadStructureDefinitions(config?: MedplumServerConfig): void {
  if (!loaded) {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

    const enabledSearchParameters = new Set(config?.enabledSearchParameters ?? EMPTY);
    const allEnabled = enabledSearchParameters.size === 0;

    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      const bundle = readJson(filename) as Bundle<WithId<SearchParameter>>;
      const medplumBundle = filename.includes('search-parameters-medplum.json');
      for (const entry of bundle.entry ?? EMPTY) {
        const resource = entry.resource as WithId<SearchParameter>;
        if (
          resource.resourceType === 'SearchParameter' &&
          (allEnabled || medplumBundle || enabledSearchParameters.has(resource.id))
        ) {
          indexSearchParameter(resource);
        }
      }
    }
    loaded = true;
  }
}
