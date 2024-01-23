import { badRequest, createReference, forbidden, isOk, notFound, OperationOutcomeError, Operator } from '@medplum/core';
import {
  BundleEntry,
  Login,
  Observation,
  OperationOutcome,
  Patient,
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
import { getClient } from '../database';
import { bundleContains, withTestContext } from '../test.setup';
import { getRepoForLogin } from './accesspolicy';
import { Repository, systemRepo } from './repo';

jest.mock('hibp');
jest.mock('ioredis');

describe('FHIR Repo', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('getRepoForLogin', async () => {
    await expect(() =>
      getRepoForLogin({ resourceType: 'Login' } as Login, { resourceType: 'ProjectMembership' } as ProjectMembership)
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
      const clientApp = 'ClientApplication/' + randomUUID();
      const projectId = randomUUID();
      const repo = new Repository({
        extendedMode: true,
        project: projectId,
        author: {
          reference: clientApp,
        },
      });

      const patient1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Update1'], family: 'Update1' }],
      });
      expect(patient1.meta?.project).toBeDefined();
      expect(patient1.meta?.project).toEqual(projectId);

      const patientWithoutProject = { ...patient1 };
      delete (patientWithoutProject.meta as any).project;
      const patient2 = await systemRepo.updateResource<Patient>(patientWithoutProject);
      expect(patient2.meta?.project).toBeDefined();
      expect(patient2.meta?.project).toEqual(projectId);
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
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      project: randomUUID(),
      extendedMode: true,
      author: {
        reference: author,
      },
    });

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
      const clientApp = 'ClientApplication/' + randomUUID();

      const repo = new Repository({
        extendedMode: true,
        author: {
          reference: clientApp,
        },
      });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      expect(patient.meta?.author?.reference).toEqual(clientApp);
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

      const repo1 = await getRepoForLogin({ resourceType: 'Login' } as Login, result1.membership);
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

      const repo2 = await getRepoForLogin({ resourceType: 'Login' } as Login, result2.membership);
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

  test('Reindex resource type as non-admin', async () => {
    const repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'Practitioner/' + randomUUID(),
      },
    });

    try {
      await repo.reindexResourceType('Practitioner');
      fail('Expected error');
    } catch (err) {
      expect(isOk(err as OperationOutcome)).toBe(false);
    }
  });

  test('Reindex resource as non-admin', async () => {
    const repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'Practitioner/' + randomUUID(),
      },
    });

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

  test('Reindex success', async () => {
    await systemRepo.reindexResourceType('Practitioner');
  });

  test('Rebuild compartments as non-admin', async () => {
    const repo = new Repository({
      project: randomUUID(),
      author: {
        reference: 'Practitioner/' + randomUUID(),
      },
    });

    try {
      await repo.rebuildCompartmentsForResourceType('Practitioner');
      fail('Expected error');
    } catch (err) {
      expect(isOk(err as OperationOutcome)).toBe(false);
    }
  });

  test('Rebuild compartments success', () =>
    withTestContext(async () => {
      await systemRepo.rebuildCompartmentsForResourceType('Practitioner');
    }));

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

  test('Too many versions', () =>
    withTestContext(async () => {
      // Create version 1
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
      });

      // Create versions 2-10
      for (let i = 0; i < 9; i++) {
        await systemRepo.updateResource<Patient>({
          ...patient,
          name: [{ family: `Test ${i}` }],
        });
      }

      // Try to create version 11
      try {
        await systemRepo.updateResource<Patient>({
          ...patient,
          name: [{ family: `Test too many requests` }],
        });
      } catch (err) {
        const outcome = (err as OperationOutcomeError).outcome;
        expect(outcome.id).toEqual('too-many-requests');
      }
    }));

  test('expungeResource forbidden', async () => {
    const author = 'Practitioner/' + randomUUID();

    const repo = new Repository({
      project: randomUUID(),
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
      project: randomUUID(),
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
      project: randomUUID(),
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

      const result = await getClient().query(
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

  test.skip('Profile validation', async () => {
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

    await expect(systemRepo.createResource(patient)).resolves.toBeTruthy();
    await systemRepo.createResource(profile);
    await expect(systemRepo.createResource(patient)).rejects.toEqual(
      new Error('Missing required property (Patient.gender)')
    );
  });

  test.skip('Transaction rollback', () =>
    withTestContext(async () => {
      const clientApp = 'ClientApplication/' + randomUUID();
      const projectId = randomUUID();
      const repo = new Repository({
        extendedMode: true,
        project: projectId,
        author: {
          reference: clientApp,
        },
      });

      let patient: Patient | undefined;

      try {
        await repo.withTransaction(async () => {
          // Create one patient
          // This will initially succeed, but should then be rolled back
          patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
          expect(patient).toBeDefined();

          // Read the patient by ID
          // This should succeed within the transaction
          const readCheck1 = await repo.readResource('Patient', patient.id as string);
          expect(readCheck1).toBeDefined();

          // Search for patient by ID
          // This should succeed within the transaction
          const searchCheck1 = await repo.search<Patient>({
            resourceType: 'Patient',
            filters: [{ code: '_id', operator: Operator.EQUALS, value: patient.id as string }],
          });
          expect(searchCheck1).toBeDefined();
          expect(searchCheck1.entry).toHaveLength(1);

          // Now try to create a malformed patient
          // This will fail, and should rollback the entire transaction
          await repo.createResource<Patient>({ resourceType: 'Patient', foo: 'bar' } as unknown as Patient);
        });

        throw new Error('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome).toMatchObject({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'structure',
              details: {
                text: 'Invalid additional property "foo"',
              },
              expression: ['foo'],
            },
          ],
        });
      }

      // Read the patient by ID
      // This should fail, because the transaction was rolled back
      // TODO: Currently not failing due to cache bug
      // try {
      //   await repo.readResource('Patient', (patient as Patient).id as string);
      //   throw new Error('Expected error');
      // } catch (err) {
      //   expect((err as OperationOutcomeError).outcome).toMatchObject(notFound);
      // }

      // Search for patient by ID
      // This should succeed within the transaction
      const searchCheck2 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: (patient as Patient).id as string }],
      });
      expect(searchCheck2).toBeDefined();
      expect(searchCheck2.entry).toHaveLength(0);
    }));
});
