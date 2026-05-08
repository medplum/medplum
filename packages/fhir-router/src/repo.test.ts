// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  notFound,
  OperationOutcomeError,
  parseSearchRequest,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type {
  Bundle,
  Encounter,
  Observation,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
  ResourceType,
  SearchParameter,
} from '@medplum/fhirtypes';
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
    const lastUpdated = new Date('2020-01-01').toISOString();

    const account = await repo.createResource({
      resourceType: 'Account',
      status: 'active',
    });
    const accounts = [createReference(account)];

    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      id,
      meta: { versionId, lastUpdated, accounts },
    });
    expect(patient.id).toBe(id);

    // Management properties are overridden by the repo
    expect(patient.meta?.versionId).not.toBe(versionId);
    expect(patient.meta?.lastUpdated).not.toBe(lastUpdated);

    // Other properties are passed through
    expect(patient.meta?.accounts).toEqual([{ reference: `Account/${account.id}` }]);
  });

  test('Create resource with meta when seeding', async () => {
    const id = randomUUID();
    const versionId = randomUUID();
    const lastUpdated = new Date('2020-01-01').toISOString();

    const account = await repo.createResource({
      resourceType: 'Account',
      status: 'active',
    });
    const accounts = [createReference(account)];

    const patient = await repo.withSeeding(() =>
      repo.createResource<Patient>({
        resourceType: 'Patient',
        id,
        meta: { versionId, lastUpdated, accounts },
      })
    );

    expect(patient.id).toBe(id);

    // Management properties may be set when seeding
    expect(patient.meta?.versionId).toBe(versionId);
    expect(patient.meta?.lastUpdated).toBe(lastUpdated);

    // Other properties are passed through
    expect(patient.meta?.accounts).toEqual([{ reference: `Account/${account.id}` }]);
  });

  test('Create resource with duplicate ID throws error', async () => {
    const id = randomUUID();
    await repo.createResource({ resourceType: 'Patient', id });
    await expect(() => repo.createResource({ resourceType: 'Patient', id })).rejects.toThrow(OperationOutcomeError);
    await expect(() => repo.createResource({ resourceType: 'Patient', id })).rejects.toThrow(
      'Assigned ID is already in use'
    );
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
      await repo.createResource({ resourceType: 'Observation' } as Observation);
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
          await repo.createResource({
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

  describe('_include and _revinclude', () => {
    test('forward _include resolves Reference and tags entry', async () => {
      const localRepo = new MemoryRepository();
      const patient = await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      const observation = await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: createReference(patient),
      });

      const bundle = await localRepo.search(parseSearchRequest(`Observation?_id=${observation.id}&_include=Observation:subject`));

      expect(bundle.total).toBe(1);
      expect(bundle.entry).toHaveLength(2);
      const matchEntry = bundle.entry?.find((e) => e.search?.mode === 'match');
      const includeEntry = bundle.entry?.find((e) => e.search?.mode === 'include');
      expect(matchEntry?.resource?.id).toBe(observation.id);
      expect(includeEntry?.resource?.resourceType).toBe('Patient');
      expect(includeEntry?.resource?.id).toBe(patient.id);
    });

    test('reverse _revinclude finds resources referencing the base', async () => {
      const localRepo = new MemoryRepository();
      const patient = await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      const obs1 = await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'a' },
        subject: createReference(patient),
      });
      const obs2 = await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'b' },
        subject: createReference(patient),
      });

      const bundle = await localRepo.search(
        parseSearchRequest(`Patient?_id=${patient.id}&_revinclude=Observation:subject`)
      );

      expect(bundle.total).toBe(1);
      expect(bundle.entry).toHaveLength(3);
      const matchEntry = bundle.entry?.find((e) => e.search?.mode === 'match');
      expect(matchEntry?.resource?.id).toBe(patient.id);
      const includedIds = bundle.entry
        ?.filter((e) => e.search?.mode === 'include')
        .map((e) => e.resource?.id)
        .sort();
      expect(includedIds).toStrictEqual([obs1.id, obs2.id].sort());
    });

    test('unknown include parameter throws badRequest', async () => {
      const localRepo = new MemoryRepository();
      await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      await expect(
        localRepo.search(parseSearchRequest('Patient?_include=Patient:not-a-real-param'))
      ).rejects.toThrow(OperationOutcomeError);
    });

    test('does not include base resources twice when referenced by multiple results', async () => {
      const localRepo = new MemoryRepository();
      const patient = await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'a' },
        subject: createReference(patient),
      });
      await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'b' },
        subject: createReference(patient),
      });

      const bundle = await localRepo.search(
        parseSearchRequest('Observation?_include=Observation:subject')
      );

      expect(bundle.total).toBe(2);
      const includes = bundle.entry?.filter((e) => e.search?.mode === 'include') ?? [];
      expect(includes).toHaveLength(1);
      expect(includes[0].resource?.id).toBe(patient.id);
    });

    test('search without includes leaves entries un-tagged', async () => {
      const localRepo = new MemoryRepository();
      await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      const bundle = await localRepo.search(parseSearchRequest('Patient'));
      expect(bundle.entry?.[0].search).toBeUndefined();
    });

    test(':iterate chains forward includes', async () => {
      const localRepo = new MemoryRepository();
      const patient = await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      const encounter = await localRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'finished',
        class: { code: 'AMB' },
        subject: createReference(patient),
      });
      const observation = await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 't' },
        encounter: createReference(encounter),
      });

      const bundle = await localRepo.search(
        parseSearchRequest(
          `Observation?_id=${observation.id}&_include=Observation:encounter&_include:iterate=Encounter:subject`
        )
      );

      const ids = (bundle.entry ?? []).map((e) => e.resource?.id).sort();
      expect(ids).toStrictEqual([encounter.id, observation.id, patient.id].sort());
    });

    test('plain (non-iterate) include is single-hop', async () => {
      const localRepo = new MemoryRepository();
      const patient = await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      const encounter = await localRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'finished',
        class: { code: 'AMB' },
        subject: createReference(patient),
      });
      const observation = await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 't' },
        encounter: createReference(encounter),
      });

      // Without :iterate the second hop should not be applied.
      const bundle = await localRepo.search(
        parseSearchRequest(
          `Observation?_id=${observation.id}&_include=Observation:encounter&_include=Encounter:subject`
        )
      );

      const includedIds = (bundle.entry ?? [])
        .filter((e) => e.search?.mode === 'include')
        .map((e) => e.resource?.id)
        .sort();
      // Encounter pulled by Observation:encounter (single hop). Patient is NOT included
      // because Encounter:subject was applied against the base (Observation) which has no `subject`.
      expect(includedIds).toStrictEqual([encounter.id]);
    });

    test('canonical _include resolves by url', async () => {
      const localRepo = new MemoryRepository();
      const questionnaireUrl = `https://example.com/Questionnaire/${randomUUID()}`;
      const questionnaire = await localRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        status: 'active',
        url: questionnaireUrl,
      });
      const response = await localRepo.createResource<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        questionnaire: questionnaireUrl,
      });

      const bundle = await localRepo.search(
        parseSearchRequest(
          `QuestionnaireResponse?_id=${response.id}&_include=QuestionnaireResponse:questionnaire`
        )
      );

      const includes = (bundle.entry ?? []).filter((e) => e.search?.mode === 'include');
      expect(includes).toHaveLength(1);
      expect(includes[0].resource?.id).toBe(questionnaire.id);
    });

    test('chained search resolves dotted code', async () => {
      const localRepo = new MemoryRepository();
      const family = randomUUID();
      const patient = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
      });
      const otherPatient = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Other' }],
      });
      const matchingObs = await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 't' },
        subject: createReference(patient),
      });
      await localRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 't' },
        subject: createReference(otherPatient),
      });

      const bundle = await localRepo.search(parseSearchRequest(`Observation?subject:Patient.family=${family}`));

      expect(bundle.total).toBe(1);
      expect(bundle.entry).toHaveLength(1);
      expect(bundle.entry?.[0].resource?.id).toBe(matchingObs.id);
    });

    test('chained search returns empty when chain has no matches', async () => {
      const localRepo = new MemoryRepository();
      await localRepo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Real' }] });
      const bundle = await localRepo.search(
        parseSearchRequest(`Observation?subject:Patient.family=NonexistentFamily${randomUUID()}`)
      );
      expect(bundle.total).toBe(0);
      expect(bundle.entry).toBeUndefined();
    });

    test('canonical _revinclude resolves by url', async () => {
      const localRepo = new MemoryRepository();
      const questionnaireUrl = `https://example.com/Questionnaire/${randomUUID()}`;
      await localRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        status: 'active',
        url: questionnaireUrl,
      });
      const response = await localRepo.createResource<QuestionnaireResponse>({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        questionnaire: questionnaireUrl,
      });

      const bundle = await localRepo.search(
        parseSearchRequest(
          `Questionnaire?url=${encodeURIComponent(questionnaireUrl)}&_revinclude=QuestionnaireResponse:questionnaire`
        )
      );

      const includes = (bundle.entry ?? []).filter((e) => e.search?.mode === 'include');
      expect(includes).toHaveLength(1);
      expect(includes[0].resource?.id).toBe(response.id);
    });
  });

  describe('token search', () => {
    test(':not negation', async () => {
      const localRepo = new MemoryRepository();
      const family = randomUUID();
      const m = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        gender: 'male',
      });
      const f = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        gender: 'female',
      });
      const bundle = await localRepo.search(parseSearchRequest(`Patient?family=${family}&gender:not=male`));
      const ids = (bundle.entry ?? []).map((e) => e.resource?.id).sort();
      expect(ids).toStrictEqual([f.id].sort());
      expect(ids).not.toContain(m.id);
    });

    test('system|code matching', async () => {
      const localRepo = new MemoryRepository();
      const patient = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [{ system: 'http://hospital.example/mrn', value: 'ABC' }],
      });
      const matched = await localRepo.search(
        parseSearchRequest(`Patient?identifier=${encodeURIComponent('http://hospital.example/mrn|ABC')}`)
      );
      expect(matched.entry?.[0].resource?.id).toBe(patient.id);
      const notMatched = await localRepo.search(
        parseSearchRequest(`Patient?identifier=${encodeURIComponent('http://other.example|ABC')}`)
      );
      expect(notMatched.entry).toBeUndefined();
    });

    test(':in expands ValueSet to token codes', async () => {
      const localRepo = new MemoryRepository();
      const url = `https://example.com/ValueSet/${randomUUID()}`;
      await localRepo.createResource({
        resourceType: 'ValueSet',
        status: 'active',
        url,
        compose: {
          include: [
            {
              system: 'http://hl7.org/fhir/administrative-gender',
              concept: [{ code: 'male' }, { code: 'female' }],
            },
          ],
        },
      });
      const family = randomUUID();
      const m = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        gender: 'male',
      });
      const u = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        gender: 'unknown',
      });
      const bundle = await localRepo.search(
        parseSearchRequest(`Patient?family=${family}&gender:in=${encodeURIComponent(url)}`)
      );
      const ids = (bundle.entry ?? []).map((e) => e.resource?.id).sort();
      expect(ids).toContain(m.id);
      expect(ids).not.toContain(u.id);
    });

    test(':not-in inverts ValueSet membership', async () => {
      const localRepo = new MemoryRepository();
      const url = `https://example.com/ValueSet/${randomUUID()}`;
      await localRepo.createResource({
        resourceType: 'ValueSet',
        status: 'active',
        url,
        compose: {
          include: [
            {
              system: 'http://hl7.org/fhir/administrative-gender',
              concept: [{ code: 'male' }],
            },
          ],
        },
      });
      const family = randomUUID();
      const m = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        gender: 'male',
      });
      const f = await localRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        gender: 'female',
      });
      const bundle = await localRepo.search(
        parseSearchRequest(`Patient?family=${family}&gender:not-in=${encodeURIComponent(url)}`)
      );
      const ids = (bundle.entry ?? []).map((e) => e.resource?.id).sort();
      expect(ids).toContain(f.id);
      expect(ids).not.toContain(m.id);
    });

    test(':in with missing ValueSet throws badRequest', async () => {
      const localRepo = new MemoryRepository();
      await localRepo.createResource<Patient>({ resourceType: 'Patient' });
      await expect(
        localRepo.search(
          parseSearchRequest(`Patient?gender:in=${encodeURIComponent('https://example.com/missing')}`)
        )
      ).rejects.toThrow(OperationOutcomeError);
    });
  });

  describe('schema validation', () => {
    test('opt-in flag rejects resources missing required fields', async () => {
      const strict = new MemoryRepository({ validateResources: true });
      // Observation requires status and code; missing both should fail validation.
      await expect(
        strict.createResource<Observation>({ resourceType: 'Observation' } as Observation)
      ).rejects.toThrow(OperationOutcomeError);
    });

    test('opt-in flag allows valid resources', async () => {
      const strict = new MemoryRepository({ validateResources: true });
      const obs = await strict.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'temp' },
      });
      expect(obs.id).toBeDefined();
    });

    test('opt-in flag does not validate during seeding', async () => {
      const strict = new MemoryRepository({ validateResources: true });
      await strict.withSeeding(() =>
        strict.createResource<Observation>({ resourceType: 'Observation' } as Observation)
      );
    });

    test('default flag is off and accepts loose fixtures', async () => {
      const lax = new MemoryRepository();
      await expect(
        lax.createResource<Observation>({ resourceType: 'Observation' } as Observation)
      ).resolves.toBeDefined();
    });
  });
});
