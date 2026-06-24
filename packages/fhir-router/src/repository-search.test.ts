// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  parseSearchRequest,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import type { FhirRepository } from './repo';
import { MemoryRepository } from './repo';
import { SqliteRepository } from './sqlite/repo';

function createRepository(kind: 'memory' | 'sqlite'): FhirRepository {
  return kind === 'sqlite' ? new SqliteRepository() : new MemoryRepository();
}

describe.each(['memory', 'sqlite'] as const)('%s repository search', (kind) => {
  let repo: FhirRepository;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  beforeEach(() => {
    repo = createRepository(kind);
  });

  test('searchResources by id', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'TestFamily' }] });
    const resources = await repo.searchResources<Patient>(parseSearchRequest('Patient?_id=' + patient.id));
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe(patient.id);
  });

  test('searchResources returns empty for no match', async () => {
    await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Smith' }] });
    const resources = await repo.searchResources<Patient>(parseSearchRequest('Patient?family=' + randomUUID()));
    expect(resources).toHaveLength(0);
  });

  test('search by reference', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
      valueString: '42',
    });

    const bundle = await repo.search<Observation>(
      parseSearchRequest('Observation?subject=' + getReferenceString(patient))
    );
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.entry?.[0]?.resource?.valueString).toBe('42');
  });

  test('search by name contains', async () => {
    await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bart'], family: 'Simpson' }],
    });
    await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    });

    const bundle = await repo.search<Patient>(parseSearchRequest('Patient?name:contains=Simpson'));
    expect(bundle.entry).toHaveLength(2);
  });

  test('searchByReference groups results by parent', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const observation = await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: createReference(patient),
      valueString: '1',
    });

    const result = await repo.searchByReference<Observation>({ resourceType: 'Observation', count: 10 }, 'subject', [
      getReferenceString(patient),
    ]);

    expect(result[getReferenceString(patient)]).toHaveLength(1);
    expect(result[getReferenceString(patient)][0].id).toBe(observation.id);
  });
});
