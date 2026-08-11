// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchParameter } from '@medplum/fhirtypes';
import { getDefinitionResource, readJson } from '.';

describe('Definitions', () => {
  test('Read FHIR schema JSON', () => {
    const result = readJson('fhir/r4/fhir.schema.json');
    expect(result).not.toBeNull();
  });

  test('Data directory', () => {
    const dataDir = readJson('fhir/r4/fhir.schema.json');
    expect(dataDir).not.toBeNull();

    // Call again to test caching
    const dataDir2 = readJson('fhir/r4/fhir.schema.json');
    expect(dataDir2).not.toBeNull();
  });

  test('MedicationDispense context search parameter', () => {
    const searchParameter = getDefinitionResource<SearchParameter>(
      'fhir/r4/search-parameters-medplum.json',
      'SearchParameter',
      'http://hl7.org/fhir/SearchParameter/MedicationDispense-context'
    );

    expect(searchParameter).toMatchObject({
      code: 'context',
      base: ['MedicationDispense'],
      type: 'reference',
      expression: 'MedicationDispense.context',
      target: ['EpisodeOfCare', 'Encounter'],
    });
  });
});
