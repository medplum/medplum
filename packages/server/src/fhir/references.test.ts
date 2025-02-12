import { createReference, normalizeErrorString } from '@medplum/core';
import { Login, Patient, Project, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { AuthState } from '../oauth/middleware';
import { createTestProject, withTestContext } from '../test.setup';
import { getRepoForLogin } from './accesspolicy';
import { getSystemRepo } from './repo';

describe('Reference checks', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Check references on write', () =>
    withTestContext(async () => {
      const { membership, project } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });
      project.checkReferencesOnWrite = true;

      const authState: AuthState = {
        login: {} as Login,
        membership,
        project,
      };

      const repo = await getRepoForLogin(authState, true);

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient).toBeDefined();

      // Create a valid ServiceRequest
      // This should succeed
      const sr1 = await repo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        meta: {
          lastUpdated: new Date().toISOString(),
        },
        status: 'active',
        intent: 'order',
        code: { text: 'test' },

        // Strong reference to patient
        // This will be enforced
        subject: createReference(patient),

        // Expected not to choke on keys without values
        replaces: undefined,
      });
      expect(sr1).toBeDefined();

      // Create a ServiceRequest with a bad reference
      // This should fail
      try {
        await repo.createResource<ServiceRequest>({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          code: { text: 'test' },
          subject: { reference: 'Patient/' + randomUUID() },
        });
        throw new Error('Expected error');
      } catch (err) {
        expect(normalizeErrorString(err)).toContain('Invalid reference');
      }
    }));

  test('References to resources in linked Project', () =>
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
      project.checkReferencesOnWrite = true;
      project.link = [{ project: createReference(project2) }];

      const repo2 = await getRepoForLogin({ login: {} as Login, membership: membership2, project: project2 });
      const patient2 = await repo2.createResource({
        resourceType: 'Patient',
      });

      // Reference available into linked Project
      let repo = await getRepoForLogin({ login: {} as Login, membership, project });
      const patient = await repo.createResource({
        resourceType: 'Patient',
        link: [{ type: 'seealso', other: createReference(patient2) }],
      });
      expect(patient.link?.[0]?.other).toStrictEqual(createReference(patient2));

      // Unlink Project and vaerify that access is revoked
      project.link = undefined;
      repo = await getRepoForLogin({
        login: {} as Login,
        membership,
        project,
      });
      await expect(
        repo.createResource({
          resourceType: 'Patient',
          link: [{ type: 'seealso', other: createReference(patient2) }],
        })
      ).rejects.toBeDefined();
    }));

  test('Project reference validation', () =>
    withTestContext(async () => {
      const { membership, project: project1 } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });

      const { membership: _membership2, project: project2 } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });
      project1.checkReferencesOnWrite = true;
      project1.link = [{ project: createReference(project2) }];
      const systemRepo = getSystemRepo();
      await systemRepo.updateResource(project1);

      const repo = await getRepoForLogin({ login: { resourceType: 'Login' } as Login, membership, project: project1 });
      let project = await repo.readResource<Project>('Project', project1.id as string);

      // Checking the name change is ancillary; mostly confirming that the update
      // doesn't throw due to reference validation failure
      expect(project.name).not.toStrictEqual('new name');
      project.name = 'new name';
      project = await repo.updateResource(project);
      expect(project.name).toStrictEqual('new name');
    }));

  test('ProjectMembership reference validation', () =>
    withTestContext(async () => {
      let { membership, project } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });

      const systemRepo = getSystemRepo();
      project = await systemRepo.updateResource({ ...project, checkReferencesOnWrite: true });

      const repo = await getRepoForLogin({ login: { resourceType: 'Login' } as Login, membership, project });

      // Checking the externalId change is ancillary; mostly confirming that the update
      // doesn't throw due to reference validation failure
      const id = randomUUID();
      expect(membership.externalId).toBeUndefined();
      membership.externalId = id;
      membership = await repo.updateResource(membership);
      expect(membership.externalId).toStrictEqual(id);
    }));

  test('Check references with non-literal reference', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ project: { checkReferencesOnWrite: true }, withRepo: true });
      const patient: Patient = {
        resourceType: 'Patient',
        link: [
          {
            type: 'refer',
            other: { display: 'J. Smith' },
          },
        ],
      };

      await expect(repo.createResource<Patient>(patient)).resolves.toBeDefined();
    }));
});
