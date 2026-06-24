// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { FhirRouter } from '@medplum/fhir-router';
import { SqliteRepository } from '@medplum/fhir-router';
import type { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient, MockFetchClient } from './client';
import { createSqliteMockClient } from './sqlite-client';

describe('MockClient sqlite repository', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Search by name with sqlite backend', async () => {
    const repo = new SqliteRepository();
    const router = new FhirRouter();
    const fetchClient = new MockFetchClient(router, repo, 'https://example.com/');
    fetchClient.initialized = true;

    const client = new MockClient({
      mockFetchOverride: { repo, router, client: fetchClient },
    });

    await client.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bart'], family: 'Simpson' }],
    });
    await client.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    });

    const result = await client.search('Patient', 'name:contains=Simpson');
    expect(result.entry?.length).toBe(2);
  });

  test('Default seed search by name with sqlite backend', async () => {
    const client = createSqliteMockClient();
    const result = await client.search('Patient', 'name:contains=Simpson');
    expect(result.entry?.length).toBe(2);
  });
});
