import { createReference, normalizeErrorString } from '@medplum/core';
import { Patient, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { getRepoForLogin } from './accesspolicy';
import { withTestContext } from '../test.setup';

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
      const { membership } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });

      const repo = await getRepoForLogin({ resourceType: 'Login' }, membership, true, true, true);

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

        // Weak references
        // These are ignored (for now)
        basedOn: [{ reference: 'ServiceRequest?identifier=123' }, { display: 'Display only' }],
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
});
