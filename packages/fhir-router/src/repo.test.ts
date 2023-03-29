import {
  badRequest,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  notFound,
  OperationOutcomeError,
  parseSearchDefinition,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { MemoryRepository } from './repo';

const repo = new MemoryRepository();

describe('MemoryRepository', () => {
  beforeAll(async () => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Create resource', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    expect(patient.id).toBeDefined();
    expect(patient.meta?.versionId).toBeDefined();
    expect(patient.meta?.lastUpdated).toBeDefined();
  });

  test('Create resource with meta', async () => {
    const id = randomUUID();
    const versionId = randomUUID();
    const lastUpdated = new Date().toISOString();
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      id,
      meta: { versionId, lastUpdated },
    });
    expect(patient.id).toBe(id);
    expect(patient.meta?.versionId).toBe(versionId);
    expect(patient.meta?.lastUpdated).toBe(lastUpdated);
  });

  test('Read invalid reference', async () => {
    try {
      await repo.readReference({});
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome).toMatchObject(badRequest('Invalid reference'));
    }
  });

  test('Read version', async () => {
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    expect(patient.id).toBeDefined();

    const patient2 = await repo.readVersion<Patient>(
      'Patient',
      patient.id as string,
      patient.meta?.versionId as string
    );
    expect(patient2.id).toBe(patient.id);

    try {
      await repo.readVersion<Patient>('Patient', patient.id as string, randomUUID());
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome).toMatchObject(notFound);
    }
  });

  test('Count and offset', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.createResource<Observation>({ resourceType: 'Observation' });
    }

    const bundle = await repo.search({ resourceType: 'Observation', offset: 1, count: 1 });
    expect(bundle.entry).toHaveLength(1);
  });

  test('searchResources helper', async () => {
    const family = randomUUID();
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
    const resources = await repo.searchResources<Patient>(parseSearchDefinition('Patient?family=' + family));
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe(patient.id);

    const emptyResources = await repo.searchResources<Patient>(parseSearchDefinition('Patient?family=' + randomUUID()));
    expect(emptyResources).toHaveLength(0);
  });

  test('searchOne helper', async () => {
    const family = randomUUID();
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
    const resource = await repo.searchOne<Patient>(parseSearchDefinition('Patient?family=' + family));
    expect(resource?.id).toBe(patient.id);

    const emptyResource = await repo.searchOne<Patient>(parseSearchDefinition('Patient?family=' + randomUUID()));
    expect(emptyResource).toBeUndefined();
  });

  test('Sort unknown search parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.createResource<Patient>({ resourceType: 'Patient' });
    }

    // Mock repository silently ignores unknown search parameters
    // This is different than the real server environment, which will throw an error
    const bundle = await repo.search({ resourceType: 'Patient', sortRules: [{ code: 'xyz' }] });
    expect(bundle.entry).toBeDefined();
  });
});
