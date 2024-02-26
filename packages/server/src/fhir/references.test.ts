import { createReference, normalizeErrorString } from '@medplum/core';
import { Login, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { withTestContext } from '../test.setup';
import { getRepoForLogin } from './accesspolicy';

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

      const repo = await getRepoForLogin({ resourceType: 'Login' } as Login, membership, project, true);

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

        // Conditional references
        // These are ignored (for now)
        basedOn: [{ reference: 'ServiceRequest?identifier=123' }, { display: 'Display only' }],

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

      const repo2 = await getRepoForLogin({ resourceType: 'Login' } as Login, membership2, project2, true);
      const patient2 = await repo2.createResource({
        resourceType: 'Patient',
      });

      // Reference available into linked Project
      let repo = await getRepoForLogin({ resourceType: 'Login' } as Login, membership, project, true);
      const patient = await repo.createResource({
        resourceType: 'Patient',
        link: [{ type: 'seealso', other: createReference(patient2) }],
      });
      expect(patient.link?.[0]?.other).toEqual(createReference(patient2));

      // Unlink Project and vaerify that access is revoked
      project.link = undefined;
      repo = await getRepoForLogin({ resourceType: 'Login' } as Login, membership, project, true);
      await expect(
        repo.createResource({
          resourceType: 'Patient',
          link: [{ type: 'seealso', other: createReference(patient2) }],
        })
      ).rejects.toBeDefined();
    }));
});
