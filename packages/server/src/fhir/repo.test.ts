import {
  allOk,
  badRequest,
  created,
  createReference,
  getReferenceString,
  isOk,
  notFound,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  preconditionFailed,
  toTypedValue,
} from '@medplum/core';
import {
  BundleEntry,
  ElementDefinition,
  Login,
  Observation,
  OperationOutcome,
  Organization,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  Questionnaire,
  ResearchDefinition,
  ResourceType,
  ServiceRequest,
  StructureDefinition,
  User,
} from '@medplum/fhirtypes';
import { randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initAppServices, shutdownApp } from '../app';
import { registerNew, RegisterRequest } from '../auth/register';
import { loadTestConfig } from '../config';
import { DatabaseMode, getDatabasePool } from '../database';
import { bundleContains, createTestProject, withTestContext } from '../test.setup';
import { getRepoForLogin } from './accesspolicy';
import { getSystemRepo, Repository, setTypedPropertyValue } from './repo';

jest.mock('hibp');

describe('FHIR Repo', () => {
  const testProject: Project = {
    resourceType: 'Project',
    id: randomUUID(),
  };

  let systemRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    systemRepo = getSystemRepo();
  });

  test('getRepoForLogin', async () => {
    await expect(() =>
      getRepoForLogin({
        login: { resourceType: 'Login' } as Login,
        membership: { resourceType: 'ProjectMembership' } as ProjectMembership,
        project: testProject,
      })
    ).rejects.toThrow('Invalid author reference');
  });

  test('Read resource with undefined id', async () => {
    try {
      await systemRepo.readResource('Patient', undefined as unknown as string);
      fail('Should have thrown');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
    }
  });

  test('Read resource with blank id', async () => {
    try {
      await systemRepo.readResource('Patient', '');
      fail('Should have thrown');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
    }
  });

  test('Read resource with invalid id', async () => {
    try {
      await systemRepo.readResource('Patient', 'x');
      fail('Should have thrown');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(isOk(outcome)).toBe(false);
    }
  });

  test('Read invalid resource with `checkCacheOnly` set', async () => {
    await expect(systemRepo.readResource('Subscription', randomUUID(), { checkCacheOnly: true })).rejects.toThrow(
      new OperationOutcomeError(notFound)
    );
  });

  test('Repo read malformed reference', async () => {
    try {
      await systemRepo.readReference({ reference: undefined });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }

    try {
      await systemRepo.readReference({ reference: '' });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }

    try {
      await systemRepo.readReference({ reference: '////' });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }

    try {
      await systemRepo.readReference({ reference: 'Patient/123/foo' });
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).not.toBe('ok');
    }
  });

  test('Read history', () =>
    withTestContext(async () => {
      const version1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          lastUpdated: new Date(Date.now() - 1000 * 60).toISOString(),
        },
      });
      expect(version1).toBeDefined();
      expect(version1.id).toBeDefined();

      const version2 = await systemRepo.updateResource<Patient>({
        resourceType: 'Patient',
        id: version1.id,
        active: true,
        meta: {
          lastUpdated: new Date().toISOString(),
        },
      });
      expect(version2).toBeDefined();
      expect(version2.id).toStrictEqual(version1.id);
      expect(version2.meta?.versionId).not.toStrictEqual(version1.meta?.versionId);

      const history = await systemRepo.readHistory('Patient', version1.id as string);
      expect(history).toBeDefined();
      expect(history.entry?.length).toBe(2);
      expect(history.entry?.[0]?.resource?.id).toBe(version2.id);
      expect(history.entry?.[1]?.resource?.id).toBe(version1.id);
    }));

  test('Update patient', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Update1'], family: 'Update1' }],
      });

      const patient2 = await systemRepo.updateResource<Patient>({
        ...(patient1 as Patient),
        active: true,
      });

      expect(patient2.id).toStrictEqual(patient1.id);
      expect(patient2.meta?.versionId).not.toStrictEqual(patient1.meta?.versionId);
    }));

  test('Update patient remove meta.profile', () =>
    withTestContext(async () => {
      const profileUrl = 'http://example.com/patient-profile';
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { profile: [profileUrl] },
        name: [{ given: ['Update1'], family: 'Update1' }],
      });
      expect(patient1.meta?.profile).toStrictEqual(expect.arrayContaining([profileUrl]));
      expect(patient1.meta?.profile?.length).toStrictEqual(1);

      const patientWithoutProfile = { ...patient1 };
      delete (patientWithoutProfile.meta as any).profile;
      const patient2 = await systemRepo.updateResource<Patient>(patientWithoutProfile);
      expect('profile' in (patient2.meta as any)).toBe(false);
    }));

  test('meta.project preserved after attempting to remove it', () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withClient: true, withRepo: true });

      const patient1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Update1'], family: 'Update1' }],
      });
      expect(patient1.meta?.project).toBeDefined();
      expect(patient1.meta?.project).toStrictEqual(project.id);

      const patientWithoutProject = { ...patient1 };
      delete (patientWithoutProject.meta as any).project;
      const patient2 = await systemRepo.updateResource<Patient>(patientWithoutProject);
      expect(patient2.meta?.project).toBeDefined();
      expect(patient2.meta?.project).toStrictEqual(project.id);
    }));

  test('Update patient no changes', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Update1'], family: 'Update1' }],
      });

      const patient2 = await systemRepo.updateResource<Patient>({
        ...(patient1 as Patient),
      });

      expect(patient2.id).toStrictEqual(patient1.id);
      expect(patient2.meta?.versionId).toStrictEqual(patient1.meta?.versionId);
    }));

  test('Update patient multiple names', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Suzy'], family: 'Smith' }],
      });

      const patient2 = await systemRepo.updateResource<Patient>({
        ...(patient1 as Patient),
        name: [
          { given: ['Suzy'], family: 'Smith' },
          { given: ['Suzy'], family: 'Jones' },
        ],
      });

      expect(patient2.id).toStrictEqual(patient1.id);
      expect(patient2.meta?.versionId).not.toStrictEqual(patient1.meta?.versionId);
      expect(patient2.name?.length).toStrictEqual(2);
      expect(patient2.name?.[0]?.family).toStrictEqual('Smith');
      expect(patient2.name?.[1]?.family).toStrictEqual('Jones');
    }));

  test('Create Patient with custom ID', async () => {
    const { repo } = await createTestProject({ withRepo: true });

    await withTestContext(async () => {
      // Try to "update" a resource, which does not exist.
      // Some FHIR systems allow users to set ID's.
      // We do not.
      try {
        await repo.updateResource<Patient>({
          resourceType: 'Patient',
          id: randomUUID(),
          name: [{ given: ['Alice'], family: 'Smith' }],
        });
      } catch (err) {
        const outcome = (err as OperationOutcomeError).outcome;
        expect(outcome.id).toStrictEqual('not-found');
      }
    });
  });

  test('Create Patient with no author', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient.meta?.author?.reference).toStrictEqual('system');
    }));

  test('Create Patient as system on behalf of author', () =>
    withTestContext(async () => {
      const author = 'Practitioner/' + randomUUID();
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        meta: {
          author: {
            reference: author,
          },
        },
      });

      expect(patient.meta?.author?.reference).toStrictEqual(author);
    }));

  test('Create Patient as ClientApplication with no author', () =>
    withTestContext(async () => {
      const { client, repo } = await createTestProject({ withClient: true, withRepo: true });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        identifier: [],
      });

      expect(patient.meta?.author?.reference).toStrictEqual(getReferenceString(client));

      // empty identifier array should removed when read from cache
      const readPatient = await repo.readResource<Patient>('Patient', patient.id as string, { checkCacheOnly: true });
      expect(readPatient.identifier).toBeUndefined();
    }));

  test('Create Patient as Practitioner with no author', () =>
    withTestContext(async () => {
      const author = 'Practitioner/' + randomUUID();

      const repo = new Repository({
        extendedMode: true,
        author: {
          reference: author,
        },
      });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient.meta?.author?.reference).toStrictEqual(author);
    }));

  test('Create Patient as Practitioner on behalf of author', () =>
    withTestContext(async () => {
      const author = 'Practitioner/' + randomUUID();
      const fakeAuthor = 'Practitioner/' + randomUUID();

      const repo = new Repository({
        extendedMode: true,
        author: {
          reference: author,
        },
      });

      // We are acting as a Practitioner
      // Practitioner does *not* have the right to set the author
      // So even though we pass in an author,
      // We expect the Practitioner to be in the result.
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        meta: {
          author: {
            reference: fakeAuthor,
          },
        },
      });

      expect(patient.meta?.author?.reference).toStrictEqual(author);
    }));

  test('Create resource with lastUpdated', () =>
    withTestContext(async () => {
      const lastUpdated = '2020-01-01T12:00:00Z';

      // System systemRepo has the ability to write custom timestamps
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        meta: {
          lastUpdated,
        },
      });

      expect(patient.meta?.lastUpdated).toStrictEqual(lastUpdated);
    }));

  const fourByteChars = '𓃒𓃔𓃕𓃖𓃗𓃘𓃙𓃚𓃛𓃜𓃝𓃞𓃟𓃠𓃡𓃢𓃥𓃦𓃧𓃩𓃪𓃭𓃮𓃯𓃰𓃱𓃲𓄁𓅂𓅃𓅠𓅚';
  test.each([
    ['2736 chars, 2736 random bytes', randomBytes(2050).toString('base64')],
    ['6668 chars, 6668 random bytes', randomBytes(5000).toString('base64')],
    ['6400 chars, 12800 bytes', shuffleString(fourByteChars.repeat(100))],
  ])('Create ResearchDefinition with long description (%s)', (_testTitle, description) =>
    withTestContext(async () => {
      const author = 'Practitioner/' + randomUUID();

      const repo = new Repository({
        extendedMode: true,
        author: {
          reference: author,
        },
      });

      await repo.createResource<ResearchDefinition>({
        resourceType: 'ResearchDefinition',
        status: 'active',
        population: { reference: '123' },
        description,
      });
    })
  );

  test('Update resource with lastUpdated', () =>
    withTestContext(async () => {
      const lastUpdated = '2020-01-01T12:00:00Z';

      // System systemRepo has the ability to write custom timestamps
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        meta: {
          lastUpdated,
        },
      });
      expect(patient1.meta?.lastUpdated).toStrictEqual(lastUpdated);

      // But system cannot update the timestamp
      const patient2 = await systemRepo.updateResource<Patient>({
        ...(patient1 as Patient),
        active: true,
        meta: {
          lastUpdated,
        },
      });
      expect(patient2.meta?.lastUpdated).not.toStrictEqual(lastUpdated);
    }));

  test('Update resource with missing id', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      });

      const { id, ...rest } = patient1;
      expect(id).toBeDefined();
      expect((rest as Patient).id).toBeUndefined();

      try {
        await systemRepo.updateResource<Patient>(rest);
        fail('Should have thrown');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome).toMatchObject(badRequest('Missing id'));
      }
    }));

  test('Update resource with matching versionId', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      });

      patient.name = [{ family: 'TestUpdated' }];
      await systemRepo.updateResource<Patient>(patient, { ifMatch: patient.meta?.versionId });
      expect(patient.name?.at(0)?.family).toStrictEqual('TestUpdated');
    }));

  test('Update resource with different versionId', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      });

      await expect(systemRepo.updateResource(patient, { ifMatch: 'bad-id' })).rejects.toThrow(
        new OperationOutcomeError(preconditionFailed)
      );
    }));

  test('Patch resource with matching versionId', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      });

      const patched = await systemRepo.patchResource<Patient>(
        patient.resourceType,
        patient.id as string,
        [{ op: 'replace', path: '/name/0/family', value: 'TestUpdated' }],
        {
          ifMatch: patient.meta?.versionId,
        }
      );
      expect(patched.name?.at(0)?.family).toStrictEqual('TestUpdated');
    }));

  test('Patch resource with different versionId', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      });

      await expect(
        systemRepo.patchResource<Patient>(
          patient.resourceType,
          patient.id as string,
          [{ op: 'add', path: '/birthDate', value: '1993-09-14' }],
          { ifMatch: 'bad-id' }
        )
      ).rejects.toThrow(new OperationOutcomeError(preconditionFailed));
    }));

  test('Compartment permissions', () =>
    withTestContext(async () => {
      const registration1: RegisterRequest = {
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      };

      const result1 = await registerNew(registration1);
      expect(result1.profile).toBeDefined();

      const repo1 = await getRepoForLogin(result1);
      const patient1 = await repo1.createResource<Patient>({
        resourceType: 'Patient',
      });

      expect(patient1).toBeDefined();
      expect(patient1.id).toBeDefined();

      const patient2 = await repo1.readResource('Patient', patient1.id as string);
      expect(patient2).toBeDefined();
      expect(patient2.id).toStrictEqual(patient1.id);

      const registration2: RegisterRequest = {
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      };

      const result2 = await registerNew(registration2);
      expect(result2.profile).toBeDefined();

      const repo2 = await getRepoForLogin(result2);
      try {
        await repo2.readResource('Patient', patient1.id as string);
        fail('Should have thrown');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome).toMatchObject(notFound);
      }
    }));

  test('Read history after delete', () =>
    withTestContext(async () => {
      // Create the patient
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      const history1 = await systemRepo.readHistory('Patient', patient.id as string);
      expect(history1.entry?.length).toBe(1);

      // Delete the patient
      await systemRepo.deleteResource('Patient', patient.id as string);

      const history2 = await systemRepo.readHistory('Patient', patient.id as string);
      expect(history2.entry?.length).toBe(2);

      // Restore the patient
      await systemRepo.updateResource({ ...patient, meta: undefined });

      const history3 = await systemRepo.readHistory('Patient', patient.id as string);
      expect(history3.entry?.length).toBe(3);

      const entries = history3.entry as BundleEntry[];
      expect(entries[0].response?.status).toStrictEqual('200');
      expect(entries[0].resource).toBeDefined();
      expect(entries[1].response?.status).toStrictEqual('410');
      expect((entries[1].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toMatch(/Deleted on /);
      expect(entries[1].resource).toBeUndefined();
      expect(entries[2].response?.status).toStrictEqual('200');
      expect(entries[2].resource).toBeDefined();
    }));

  test('Reindex resource as non-admin', async () => {
    const { repo } = await createTestProject({ withRepo: true });

    try {
      await repo.reindexResource('Practitioner', randomUUID());
      fail('Expected error');
    } catch (err) {
      expect(isOk(err as OperationOutcome)).toBe(false);
    }
  });

  test('Reindex resource not found', async () => {
    try {
      await systemRepo.reindexResource('Practitioner', randomUUID());
      fail('Expected error');
    } catch (err) {
      expect(isOk(err as OperationOutcome)).toBe(false);
    }
  });

  test('Remove property', () =>
    withTestContext(async () => {
      const value = randomUUID();

      // Create a patient with an identifier
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Identifier'], family: 'Test' }],
        identifier: [{ system: 'https://example.com/', value }],
      });

      // Search for patient by identifier
      // This should succeed
      const bundle1 = await systemRepo.search<Patient>({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value,
          },
        ],
      });
      expect(bundle1.entry?.length).toStrictEqual(1);

      const { identifier, ...rest } = patient1;
      expect(identifier).toBeDefined();
      expect((rest as Patient).identifier).toBeUndefined();

      const patient2 = await systemRepo.updateResource<Patient>(rest);
      expect(patient2.identifier).toBeUndefined();

      // Try to search for the identifier
      // This should return empty result
      const bundle2 = await systemRepo.search<Patient>({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value,
          },
        ],
      });
      expect(bundle2.entry?.length).toStrictEqual(0);
    }));

  test('Delete Questionnaire.subjectType', () =>
    withTestContext(async () => {
      const nonce = randomUUID();

      const resource1 = await systemRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        status: 'active',
        subjectType: [nonce as ResourceType],
      });

      const resource2 = await systemRepo.search({
        resourceType: 'Questionnaire',
        filters: [
          {
            code: 'subject-type',
            operator: Operator.EQUALS,
            value: nonce,
          },
        ],
      });
      expect(resource2.entry?.length).toStrictEqual(1);

      delete resource1.subjectType;
      await systemRepo.updateResource<Questionnaire>(resource1);

      const resource4 = await systemRepo.search({
        resourceType: 'Questionnaire',
        filters: [
          {
            code: 'subject-type',
            operator: Operator.EQUALS,
            value: nonce,
          },
        ],
      });
      expect(resource4.entry?.length).toStrictEqual(0);
    }));

  test('Empty objects', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        contact: [
          {
            name: {
              given: ['Test'],
            },
          },
        ],
      });

      const patient2 = await systemRepo.updateResource<Patient>({
        resourceType: 'Patient',
        id: patient1.id,
        contact: [
          {
            name: {
              given: ['Test'],
            },
          },
        ],
      });
      expect(patient2.id).toStrictEqual(patient1.id);
    }));

  test('expungeResource forbidden', async () => {
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      projects: [randomUUID()],
      extendedMode: true,
      author: {
        reference: author,
      },
    });

    // Try to expunge as a regular user
    await expect(repo.expungeResource('Patient', new Date().toISOString())).rejects.toThrow('Forbidden');
  });

  test('expungeResources forbidden', async () => {
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      projects: [randomUUID()],
      extendedMode: true,
      author: {
        reference: author,
      },
    });

    // Try to expunge as a regular user
    await expect(repo.expungeResources('Patient', [new Date().toISOString()])).rejects.toThrow('Forbidden');
  });

  test('Purge forbidden', async () => {
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      projects: [randomUUID()],
      extendedMode: true,
      author: {
        reference: author,
      },
    });

    // Try to purge as a regular user
    await expect(repo.purgeResources('Patient', new Date().toISOString())).rejects.toThrow('Forbidden');
  });

  test('Purge Login', () =>
    withTestContext(async () => {
      const oldDate = '2000-01-01T00:00:00.000Z';

      // Create a login using super admin with a date in the distant past
      // This takes advantage of the fact that super admins can set meta.lastUpdated
      const login = await systemRepo.createResource<Login>({
        resourceType: 'Login',
        meta: {
          lastUpdated: oldDate,
        },
        user: { reference: 'system' },
        authMethod: 'password',
        authTime: oldDate,
      });

      const bundle1 = await systemRepo.search({
        resourceType: 'Login',
        filters: [{ code: '_lastUpdated', operator: Operator.LESS_THAN_OR_EQUALS, value: oldDate }],
      });
      expect(bundleContains(bundle1, login)).toBeTruthy();

      // Purge logins before the cutoff date
      await systemRepo.purgeResources('Login', oldDate);

      // Make sure the login is truly gone
      const bundle = await systemRepo.search({
        resourceType: 'Login',
        filters: [{ code: '_lastUpdated', operator: Operator.ENDS_BEFORE, value: oldDate }],
        total: 'accurate',
        count: 0,
      });
      expect(bundle.total).toStrictEqual(0);
    }));

  test('Duplicate :text tokens', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      const obs1 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [
            {
              system: 'https://example.com',
              code: 'HDL',
              display: 'HDL',
            },
          ],
          text: 'HDL',
        },
        subject: createReference(patient),
      });

      const result = await getDatabasePool(DatabaseMode.READER).query(
        'SELECT "code", "system", "value" FROM "Observation_Token" WHERE "resourceId"=$1',
        [obs1.id]
      );

      expect(result.rows).toMatchObject([
        {
          code: 'code',
          system: 'text',
          value: 'HDL',
        },
        {
          code: 'code',
          system: 'https://example.com',
          value: 'HDL',
        },
        {
          code: 'combo-code',
          system: 'text',
          value: 'HDL',
        },
        {
          code: 'combo-code',
          system: 'https://example.com',
          value: 'HDL',
        },
      ]);
    }));

  test('Malformed client assigned ID', async () => {
    try {
      await systemRepo.updateResource({ resourceType: 'Patient', id: '123' });
      throw new Error('expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Invalid id');
    }
  });

  test('Profile validation', async () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });

      const profile = JSON.parse(
        readFileSync(resolve(__dirname, '__test__/us-core-patient.json'), 'utf8')
      ) as StructureDefinition;
      profile.url = (profile.url ?? '') + Math.random();
      const patient: Patient = {
        resourceType: 'Patient',
        meta: {
          profile: [profile.url],
        },
        identifier: [
          {
            system: 'http://example.com/patient-id',
            value: 'foo',
          },
        ],
        name: [
          {
            given: ['Alex'],
            family: 'Baker',
          },
        ],
        // Missing gender property is required by profile
      };

      await expect(repo.createResource(patient)).resolves.toBeTruthy();
      await repo.createResource(profile);
      await expect(repo.createResource(patient)).rejects.toThrow(
        new Error('Missing required property (Patient.gender)')
      );
    }));

  test('Profile update', async () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });

      const originalProfile = JSON.parse(
        readFileSync(resolve(__dirname, '__test__/us-core-patient.json'), 'utf8')
      ) as StructureDefinition;

      const profile = await repo.createResource<StructureDefinition>({
        ...originalProfile,
        url: randomUUID(),
      });

      const patient: Patient = {
        resourceType: 'Patient',
        meta: { profile: [profile.url] },
        identifier: [{ system: 'http://example.com/patient-id', value: 'foo' }],
        name: [{ given: ['Alex'], family: 'Baker' }],
        gender: 'male',
      };

      // Create the patient
      // This should succeed
      await expect(repo.createResource(patient)).resolves.toBeTruthy();

      // Now update the profile to make "address" a required field
      await repo.updateResource<StructureDefinition>({
        ...profile,
        snapshot: {
          ...profile.snapshot,
          element: profile.snapshot?.element?.map((e) => {
            if (e.path === 'Patient.address') {
              return {
                ...e,
                min: 1,
              };
            }
            return e;
          }) as ElementDefinition[],
        },
      });

      // Now try to create another patient without an address
      // This should fail
      await expect(repo.createResource(patient)).rejects.toThrow(
        new Error('Missing required property (Patient.address)')
      );
    }));

  test('Conditional update', () =>
    withTestContext(async () => {
      const mrn = randomUUID();
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [{ system: 'http://example.com/mrn', value: mrn }],
      };

      // Invalid search resource type mismatch
      await expect(
        systemRepo.conditionalUpdate(patient, {
          resourceType: 'Observation',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'http://example.com/mrn|' + mrn }],
        })
      ).rejects.toThrow('Search type must match resource type for conditional update');

      // Invalid create with preassigned ID
      await expect(
        systemRepo.conditionalUpdate(
          { ...patient, id: randomUUID() },
          {
            resourceType: 'Patient',
            filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'http://example.com/mrn|' + mrn }],
          }
        )
      ).rejects.toThrow('Cannot perform create as update with client-assigned ID (Patient.id)');

      // Create new resource
      const create = await systemRepo.conditionalUpdate(patient, {
        resourceType: 'Patient',
        filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'http://example.com/mrn|' + mrn }],
      });
      expect(create.resource.id).toBeDefined();
      const existing = create.resource;
      expect(create.outcome.id).toStrictEqual(created.id);

      // Update existing resource
      patient.gender = 'unknown';
      const update = await systemRepo.conditionalUpdate(patient, {
        resourceType: 'Patient',
        filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'http://example.com/mrn|' + mrn }],
      });
      expect(update.resource.id).toStrictEqual(existing.id);
      expect(update.resource.gender).toStrictEqual('unknown');
      expect(update.outcome.id).toStrictEqual(allOk.id);

      // Update with incorrect ID
      patient.id = randomUUID();
      await expect(
        systemRepo.conditionalUpdate(patient, {
          resourceType: 'Patient',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'http://example.com/mrn|' + mrn }],
        })
      ).rejects.toThrow('Resource ID did not match resolved ID (Patient.id)');

      // Create duplicate resource
      const duplicate = await systemRepo.createResource(patient);
      expect(duplicate.id).not.toStrictEqual(existing.id);

      // Invalid update with ambiguous target
      await expect(
        systemRepo.conditionalUpdate(patient, {
          resourceType: 'Patient',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'http://example.com/mrn|' + mrn }],
        })
      ).rejects.toThrow('Multiple resources found matching condition');
    }));

  test('Double DELETE', async () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });
      await systemRepo.deleteResource(patient.resourceType, patient.id as string);
      await expect(systemRepo.deleteResource(patient.resourceType, patient.id as string)).resolves.toBeUndefined();
    }));

  test('Conditional reference resolution', async () =>
    withTestContext(async () => {
      const practitionerIdentifier = randomUUID();
      const practitioner = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        identifier: [{ system: 'http://hl7.org.fhir/sid/us-npi', value: practitionerIdentifier }],
      });
      const conditionalReference = {
        reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|' + practitionerIdentifier,
      };

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { account: conditionalReference },
        generalPractitioner: [conditionalReference],
      });
      const expectedPractitioner = getReferenceString(practitioner);
      expect(patient.generalPractitioner?.[0]?.reference).toStrictEqual(expectedPractitioner);
      expect(patient.meta?.account?.reference).toStrictEqual(expectedPractitioner);
      expect(patient.meta?.accounts).toHaveLength(1);
      expect(patient.meta?.accounts).toContainEqual({ reference: expectedPractitioner });
    }));

  test('Conditional reference resolution failure', async () =>
    withTestContext(async () => {
      const practitionerIdentifier = randomUUID();
      const patient: Patient = {
        resourceType: 'Patient',
        generalPractitioner: [
          { reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|' + practitionerIdentifier },
        ],
      };
      await expect(systemRepo.createResource<Patient>(patient)).rejects.toThrow(/did not match any resources/);
    }));

  test('Conditional reference resolution multiple matches', async () =>
    withTestContext(async () => {
      const practitionerIdentifier = randomUUID();
      await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        identifier: [{ system: 'http://hl7.org.fhir/sid/us-npi', value: practitionerIdentifier }],
      });
      await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        identifier: [{ system: 'http://hl7.org.fhir/sid/us-npi', value: practitionerIdentifier }],
      });

      const patient: Patient = {
        resourceType: 'Patient',
        generalPractitioner: [
          { reference: 'Practitioner?identifier=http://hl7.org.fhir/sid/us-npi|' + practitionerIdentifier },
        ],
      };
      await expect(systemRepo.createResource<Patient>(patient)).rejects.toThrow();
    }));

  test('Conditional reference replaced before validation', async () =>
    withTestContext(async () => {
      const mrn = randomUUID();
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [{ value: mrn }],
      };
      await systemRepo.createResource<Patient>(patient);

      const serviceRequest = {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '308471005',
              display: 'Referral to cardiologist',
            },
          ],
        },
        // Reference should be replaced and NOT cause a validation error
        subject: {
          reference: 'Patient?identifier=' + mrn,
        },
        // The performerType field should be a CodeableConcept, not an array
        performerType: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '17561000',
                display: 'Cardiologist',
              },
            ],
          },
        ],
      } as unknown as ServiceRequest;
      await expect(systemRepo.createResource(serviceRequest)).rejects.toThrow(/^Expected single .*?performerType\)$/);
    }));

  test('Project default profiles', async () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withClient: true,
        withRepo: true,
        project: {
          defaultProfile: [
            { resourceType: 'Observation', profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'] },
          ],
        },
      });

      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        category: [
          { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
        ],
        code: { text: 'Strep test' },
        effectiveDateTime: '2024-02-13T14:34:56Z',
        valueBoolean: true,
      };

      await expect(systemRepo.createResource(observation)).resolves.toBeDefined();
      await expect(repo.createResource(observation)).rejects.toThrow('Missing required property (Observation.subject)');

      observation.subject = { identifier: { value: randomUUID() } };
      await expect(repo.createResource(observation)).resolves.toMatchObject<Partial<Observation>>({
        meta: expect.objectContaining({
          profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
        }),
      });
    }));

  test('Allows adding compartments for specific types', async () =>
    withTestContext(async () => {
      const { repo, project } = await createTestProject({ withRepo: true });
      const org = await repo.createResource<Organization>({ resourceType: 'Organization' });
      const practitioner = await repo.createResource<Practitioner>({ resourceType: 'Practitioner' });

      const orgReference = createReference(org);
      const practitionerReference = createReference(practitioner);
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { compartment: [orgReference, practitionerReference] },
      });
      expect(patient.meta?.compartment).toContainEqual(orgReference);
      expect(patient.meta?.compartment).not.toContainEqual(practitionerReference);
      expect(patient.meta?.compartment).toContainEqual({ reference: getReferenceString(project) });
      expect(patient.meta?.compartment).toContainEqual({ reference: getReferenceString(patient) });

      const results = await repo.searchResources(
        parseSearchRequest('Patient?_compartment=' + getReferenceString(orgReference))
      );
      expect(results).toHaveLength(1);
    }));

  test('Prevents setting Project compartments', async () =>
    withTestContext(async () => {
      const { repo, project } = await createTestProject({ withRepo: true });
      const { project: otherProject, repo: otherRepo } = await createTestProject({ withRepo: true });
      const projectReference = createReference(otherProject);
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { compartment: [projectReference], account: projectReference },
      });
      expect(patient.meta?.compartment).toContainEqual({ reference: getReferenceString(project) });
      expect(patient.meta?.compartment).toContainEqual({ reference: getReferenceString(patient) });
      expect(patient.meta?.compartment).not.toContainEqual({ reference: getReferenceString(otherProject) });

      const results = await otherRepo.searchResources(parseSearchRequest('Patient'));
      expect(results).toHaveLength(0);
    }));

  test('setTypedValue', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      photo: [
        {
          contentType: 'image/png',
          url: 'https://example.com/photo.png',
        },
        {
          contentType: 'image/png',
          data: 'base64data',
        },
      ],
    };

    setTypedPropertyValue(toTypedValue(patient), 'photo[1].contentType', { type: 'string', value: 'image/jpeg' });
    expect(patient.photo?.[1].contentType).toStrictEqual('image/jpeg');
  });

  test('Super admin can edit User.meta.project', async () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });

      // Create a user in the project
      const user1 = await repo.createResource<User>({
        resourceType: 'User',
        email: randomUUID() + '@example.com',
        firstName: randomUUID(),
        lastName: randomUUID(),
      });
      expect(user1.meta?.project).toStrictEqual(project.id);

      // Try to change the project as the normal user
      // Should silently fail, and preserve the meta.project
      const user2 = await repo.updateResource<User>({
        ...user1,
        meta: { project: undefined },
      });
      expect(user2.meta?.project).toStrictEqual(project.id);

      // Now try to change the project as the super admin
      // Should succeed
      const user3 = await systemRepo.updateResource<User>({
        ...user2,
        meta: { project: undefined },
      });
      expect(user3.meta?.project).toBeUndefined();
    }));

  test('Handles caching of profile from linked project', async () =>
    withTestContext(async () => {
      const { membership, project } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });

      const { membership: membership2, project: project2 } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });
      project.link = [{ project: createReference(project2) }];

      const repo2 = await getRepoForLogin({ login: {} as Login, membership: membership2, project: project2 });
      const profileJson = JSON.parse(
        readFileSync(resolve(__dirname, '__test__/us-core-patient.json'), 'utf8')
      ) as StructureDefinition;
      const profile = await repo2.createResource(profileJson);

      const patientJson: Patient = {
        resourceType: 'Patient',
        meta: {
          profile: [profile.url],
        },
      };

      // Resource upload should fail with profile linked
      let repo = await getRepoForLogin({ login: {} as Login, membership, project });
      await expect(repo.createResource(patientJson)).rejects.toThrow(/Missing required property/);

      // Unlink Project and verify that profile is not cached; resource upload should succeed without access to profile
      project.link = undefined;
      repo = await getRepoForLogin({
        login: {} as Login,
        membership,
        project,
      });
      await expect(repo.createResource(patientJson)).resolves.toBeDefined();
    }));

  test('Patch post-commit stores full resource in cache', async () =>
    withTestContext(async () => {
      const { project, repo, login, membership } = await createTestProject({
        withRepo: { extendedMode: false },
        withAccessToken: true,
        withClient: true,
      });
      const extendedRepo = await getRepoForLogin({ login, project, membership }, true);

      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      expect(patient.meta?.project).toBeUndefined();
      expect(patient.gender).toBeUndefined();

      const updatedPatient = await repo.patchResource<Patient>('Patient', patient.id as string, [
        { op: 'add', path: '/gender', value: 'unknown' },
      ]);
      expect(updatedPatient.meta?.project).toBeUndefined();
      expect(updatedPatient.gender).toStrictEqual('unknown');

      const cachedPatient = await extendedRepo.readResource<Patient>('Patient', patient.id as string);
      expect(cachedPatient.meta?.project).toStrictEqual(project.id);
      expect(cachedPatient.gender).toStrictEqual('unknown');
    }));

  test('Handles resources with many entries stored in lookup table', async () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });

      const patient: Patient = {
        resourceType: 'Patient',
        link: [],
      };
      // Postgres uses a 16-bit counter for placeholder formats internally,
      // so 2^16 + 1 = 64k + 1 will definitely overflow it if not sent in smaller batches
      for (let i = 0; i < 64 * 1024 + 1; i++) {
        patient.link?.push({ type: 'seealso', other: { reference: 'Patient/' + randomUUID() } });
      }

      await expect(repo.createResource<Patient>(patient)).resolves.toBeDefined();
    }));
});

function shuffleString(s: string): string {
  const arr = Array.from(s);
  const len = arr.length;
  for (let i = 0; i < len - 1; ++i) {
    const j = Math.floor(Math.random() * len);
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr.join('');
}
