import {
  allOk,
  badRequest,
  created,
  createReference,
  forbidden,
  getReferenceString,
  isOk,
  notFound,
  OperationOutcomeError,
  Operator,
  preconditionFailed,
  toTypedValue,
} from '@medplum/core';
import {
  BundleEntry,
  ElementDefinition,
  Login,
  Observation,
  OperationOutcome,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  Questionnaire,
  ResourceType,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
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
      expect(version2.id).toEqual(version1.id);
      expect(version2.meta?.versionId).not.toEqual(version1.meta?.versionId);

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

      expect(patient2.id).toEqual(patient1.id);
      expect(patient2.meta?.versionId).not.toEqual(patient1.meta?.versionId);
    }));

  test('Update patient remove meta.profile', () =>
    withTestContext(async () => {
      const profileUrl = 'http://example.com/patient-profile';
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { profile: [profileUrl] },
        name: [{ given: ['Update1'], family: 'Update1' }],
      });
      expect(patient1.meta?.profile).toEqual(expect.arrayContaining([profileUrl]));
      expect(patient1.meta?.profile?.length).toEqual(1);

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
      expect(patient1.meta?.project).toEqual(project.id);

      const patientWithoutProject = { ...patient1 };
      delete (patientWithoutProject.meta as any).project;
      const patient2 = await systemRepo.updateResource<Patient>(patientWithoutProject);
      expect(patient2.meta?.project).toBeDefined();
      expect(patient2.meta?.project).toEqual(project.id);
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

      expect(patient2.id).toEqual(patient1.id);
      expect(patient2.meta?.versionId).toEqual(patient1.meta?.versionId);
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

      expect(patient2.id).toEqual(patient1.id);
      expect(patient2.meta?.versionId).not.toEqual(patient1.meta?.versionId);
      expect(patient2.name?.length).toEqual(2);
      expect(patient2.name?.[0]?.family).toEqual('Smith');
      expect(patient2.name?.[1]?.family).toEqual('Jones');
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
        expect(outcome.id).toEqual('not-found');
      }
    });
  });

  test('Create Patient with no author', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient.meta?.author?.reference).toEqual('system');
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

      expect(patient.meta?.author?.reference).toEqual(author);
    }));

  test('Create Patient as ClientApplication with no author', () =>
    withTestContext(async () => {
      const { client, repo } = await createTestProject({ withClient: true, withRepo: true });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient.meta?.author?.reference).toEqual(getReferenceString(client));
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

      expect(patient.meta?.author?.reference).toEqual(author);
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

      expect(patient.meta?.author?.reference).toEqual(author);
    }));

  test('Create resource with account', () =>
    withTestContext(async () => {
      const author = 'Practitioner/' + randomUUID();
      const account = 'Organization/' + randomUUID();

      // This user does not have an access policy
      // So they can optionally set an account
      const repo = new Repository({
        extendedMode: true,
        author: {
          reference: author,
        },
      });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        meta: {
          account: {
            reference: account,
          },
        },
      });

      expect(patient.meta?.author?.reference).toEqual(author);
      expect(patient.meta?.account?.reference).toEqual(account);
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

      expect(patient.meta?.lastUpdated).toEqual(lastUpdated);
    }));

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
      expect(patient1.meta?.lastUpdated).toEqual(lastUpdated);

      // But system cannot update the timestamp
      const patient2 = await systemRepo.updateResource<Patient>({
        ...(patient1 as Patient),
        active: true,
        meta: {
          lastUpdated,
        },
      });
      expect(patient2.meta?.lastUpdated).not.toEqual(lastUpdated);
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

      (patient as Patient).name = [{ family: 'TestUpdated' }];

      const versionId = patient.meta?.versionId;
      await systemRepo.updateResource<Patient>(patient, versionId);
      expect(patient.name?.at(0)?.family).toEqual('TestUpdated');
    }));

  test('Update resource with different versionId', () =>
    withTestContext(async () => {
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      });

      try {
        await systemRepo.updateResource<Patient>(patient1, 'bad-id');
        fail('Should have thrown');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome).toMatchObject(preconditionFailed);
      }
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
      expect(patient2.id).toEqual(patient1.id);

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
      expect(entries[0].response?.status).toEqual('200');
      expect(entries[0].resource).toBeDefined();
      expect(entries[1].response?.status).toEqual('410');
      expect((entries[1].response?.outcome as OperationOutcome).issue?.[0]?.details?.text).toMatch(/Deleted on /);
      expect(entries[1].resource).toBeUndefined();
      expect(entries[2].response?.status).toEqual('200');
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
      expect(bundle1.entry?.length).toEqual(1);

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
      expect(bundle2.entry?.length).toEqual(0);
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
      expect(resource2.entry?.length).toEqual(1);

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
      expect(resource4.entry?.length).toEqual(0);
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
      expect(patient2.id).toEqual(patient1.id);
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
    try {
      await repo.expungeResource('Patient', new Date().toISOString());
      fail('Purge should have failed');
    } catch (err) {
      expect((err as OperationOutcomeError).outcome).toMatchObject(forbidden);
    }
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
    try {
      await repo.expungeResources('Patient', [new Date().toISOString()]);
      fail('Purge should have failed');
    } catch (err) {
      expect((err as OperationOutcomeError).outcome).toMatchObject(forbidden);
    }
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
    try {
      await repo.purgeResources('Patient', new Date().toISOString());
      fail('Purge should have failed');
    } catch (err) {
      expect((err as OperationOutcomeError).outcome).toMatchObject(forbidden);
    }
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
      expect(bundle.total).toEqual(0);
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
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid id');
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
      await expect(repo.createResource(patient)).rejects.toEqual(
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
      await expect(repo.createResource(patient)).rejects.toEqual(
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
      expect(create.outcome.id).toEqual(created.id);

      // Update existing resource
      patient.gender = 'unknown';
      const update = await systemRepo.conditionalUpdate(patient, {
        resourceType: 'Patient',
        filters: [{ code: 'identifier', operator: Operator.EQUALS, value: 'http://example.com/mrn|' + mrn }],
      });
      expect(update.resource.id).toEqual(existing.id);
      expect(update.resource.gender).toEqual('unknown');
      expect(update.outcome.id).toEqual(allOk.id);

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
      expect(duplicate.id).not.toEqual(existing.id);

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
      expect(patient.generalPractitioner?.[0]?.reference).toEqual(getReferenceString(practitioner));
      expect(patient.meta?.account?.reference).toEqual(getReferenceString(practitioner));
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
      await expect(systemRepo.createResource<Patient>(patient)).rejects.toThrow('f');
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
    expect(patient.photo?.[1].contentType).toEqual('image/jpeg');
  });
});
