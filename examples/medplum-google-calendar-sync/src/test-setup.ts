// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { indexStructureDefinitionBundle, indexSearchParameterBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, SearchParameter, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, vi } from 'vitest';
const create = MockClient.prototype.createResource;
const conditional = MockClient.prototype.createResourceIfNoneExist;
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(MockClient.prototype, 'createResource').mockImplementation(function (
    this: MockClient,
    resource: Resource,
    options
  ) {
    return create.call(
      this,
      { ...resource, meta: { ...resource.meta, project: resource.meta?.project ?? this.getProject()?.id } },
      options
    );
  });
  vi.spyOn(MockClient.prototype, 'createResourceIfNoneExist').mockImplementation(function (
    this: MockClient,
    resource: Resource,
    query,
    options
  ) {
    return conditional.call(
      this,
      { ...resource, meta: { ...resource.meta, project: resource.meta?.project ?? this.getProject()?.id } },
      query,
      options
    );
  });
});

for (const file of ['profiles-types', 'profiles-resources', 'profiles-medplum']) {
  indexStructureDefinitionBundle(readJson(`fhir/r4/${file}.json`) as Bundle);
}
for (const file of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(file) as Bundle<SearchParameter>);
}
