// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  notFound,
  OperationOutcomeError,
  parseSearchRequest,
  WithId,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, Observation, Patient, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { randomInt, randomUUID } from 'crypto';
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

    const patient2 = await repo.readVersion<Patient>('Patient', patient.id, patient.meta?.versionId as string);
    expect(patient2.id).toBe(patient.id);

    try {
      await repo.readVersion<Patient>('Patient', patient.id, randomUUID());
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome).toMatchObject(notFound);
    }
  });

  test('Count and offset', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.createResource<Observation>({ resourceType: 'Observation' } as Observation);
    }

    const bundle = await repo.search({ resourceType: 'Observation', offset: 1, count: 1 });
    expect(bundle.entry).toHaveLength(1);
  });

  test('searchResources helper', async () => {
    const family = randomUUID();
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
    const resources = await repo.searchResources<Patient>(parseSearchRequest('Patient?family=' + family));
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe(patient.id);

    const emptyResources = await repo.searchResources<Patient>(parseSearchRequest('Patient?family=' + randomUUID()));
    expect(emptyResources).toHaveLength(0);
  });

  test('searchOne helper', async () => {
    const family = randomUUID();
    const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
    const resource = await repo.searchOne<Patient>(parseSearchRequest('Patient?family=' + family));
    expect(resource?.id).toBe(patient.id);

    const emptyResource = await repo.searchOne<Patient>(parseSearchRequest('Patient?family=' + randomUUID()));
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

  test('clears all resources', async () => {
    repo.clear();

    const resourceTypes: ResourceType[] = ['Patient', 'Observation', 'AccessPolicy', 'Account', 'Binary', 'Bot'];
    let expectedTotalResourceCount = 0;
    await Promise.all(
      resourceTypes.map(async (rt) => {
        const count = randomInt(9) + 1;
        for (let i = 0; i < count; i++) {
          await repo.createResource<any>({ resourceType: rt });
        }
        expectedTotalResourceCount += count;
      })
    );

    const resourcesListBefore = await Promise.all(
      resourceTypes.map((rt) => repo.searchResources({ resourceType: rt }))
    );
    const actualResourceCountBefore = resourcesListBefore.reduce((count, resources) => (count += resources.length), 0);
    expect(actualResourceCountBefore).toBe(expectedTotalResourceCount);

    repo.clear();

    const resourcesListAfter = await Promise.all(resourceTypes.map((rt) => repo.searchResources({ resourceType: rt })));
    const actualResourceCountAfter = resourcesListAfter.reduce((count, resources) => (count += resources.length), 0);
    expect(actualResourceCountAfter).toBe(0);
  });

  describe('searchByReference', () => {
    async function createPatients(repo: MemoryRepository, count: number): Promise<WithId<Patient>[]> {
      const patients = [];
      for (let i = 0; i < count; i++) {
        patients.push(await repo.createResource<Patient>({ resourceType: 'Patient' }));
      }
      return patients;
    }

    async function createObservations(
      repo: MemoryRepository,
      count: number,
      patient: Patient
    ): Promise<WithId<Observation>[]> {
      const resources = [];
      for (let i = 0; i < count; i++) {
        resources.push(
          await repo.createResource<Observation>({
            resourceType: 'Observation',
            subject: createReference(patient),
            valueString: i.toString(),
          } as Observation)
        );
      }
      return resources;
    }

    function zip<A, B>(a: A[], b: B[]): [A, B][] {
      return a.map((k, i) => [k, b[i]]);
    }

    function expectResultsContents<Parent extends Resource, Child extends Resource>(
      parents: Parent[],
      childrenByParent: Child[][],
      { count, offset }: { count: number; offset: number },
      results: Record<string, Child[]>
    ): void {
      expect(Object.keys(results)).toHaveLength(parents.length);
      for (const [parent, children] of zip(parents, childrenByParent)) {
        const result = results[getReferenceString(parent) as string];
        expect(result).toHaveLength(Math.min(children.length - offset, count));
        for (const child of result) {
          expect(children.map((c) => c.id)).toContain(child.id);
        }
      }
    }

    test('basic search by reference', async () => {
      const patients = await createPatients(repo, 3);
      const patientObservations = [
        await createObservations(repo, 2, patients[0]),
        await createObservations(repo, 3, patients[1]),
        await createObservations(repo, 4, patients[2]),
      ];

      const count = 3;
      const offset = 1;
      const observation = patientObservations[0][offset];
      const result = await repo.searchByReference<Observation>(
        { resourceType: 'Observation', count, offset },
        'subject',
        patients.map((p) => getReferenceString(p))
      );

      expectResultsContents(patients, patientObservations, { count, offset }, result);
      const resultRepoObservation = result[getReferenceString(patients[0])][0];
      expect(resultRepoObservation).toStrictEqual(observation);
      expect(resultRepoObservation.meta?.tag).toBeUndefined();
    });

    test('with sort', async () => {
      const patients = await createPatients(repo, 2);
      const patientObservations = [
        await createObservations(repo, 3, patients[0]),
        await createObservations(repo, 2, patients[1]),
      ];
      const count = 3;
      const offset = 0;

      // descending
      const resultDesc = await repo.searchByReference<Observation>(
        { resourceType: 'Observation', count, offset, sortRules: [{ code: 'value-string', descending: true }] },
        'subject',
        patients.map((p) => getReferenceString(p))
      );

      expectResultsContents(patients, patientObservations, { count, offset }, resultDesc);
      expect(resultDesc[getReferenceString(patients[0])].map((o) => o.valueString)).toStrictEqual(['2', '1', '0']);
      expect(resultDesc[getReferenceString(patients[1])].map((o) => o.valueString)).toStrictEqual(['1', '0']);

      // ascending
      const resultAsc = await repo.searchByReference<Observation>(
        { resourceType: 'Observation', count, sortRules: [{ code: 'value-string', descending: false }] },
        'subject',
        patients.map((p) => getReferenceString(p))
      );
      expectResultsContents(patients, patientObservations, { count, offset }, resultAsc);
      expect(resultAsc[getReferenceString(patients[0])].map((o) => o.valueString)).toStrictEqual(['0', '1', '2']);
      expect(resultAsc[getReferenceString(patients[1])].map((o) => o.valueString)).toStrictEqual(['0', '1']);
    });
  });
});
