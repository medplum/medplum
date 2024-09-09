import { OperationOutcomeError, Operator, parseSearchRequest, sleep } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { createTestProject, withTestContext } from '../test.setup';
import { Repository, getSystemRepo } from './repo';
import { randomUUID } from 'node:crypto';

describe('FHIR Repo Transactions', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Transaction commit', () =>
    withTestContext(async () => {
      let patient: Patient | undefined;
      await repo.withTransaction(async () => {
        patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient).toBeDefined();
      });
      expect(patient).toBeDefined();

      // Read the patient by ID
      // This should succeed
      const readCheck1 = await repo.readResource('Patient', patient?.id as string);
      expect(readCheck1).toBeDefined();

      // Search for patient by ID
      // This should succeed
      const searchCheck1 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient?.id as string }],
      });
      expect(searchCheck1.entry).toHaveLength(1);
    }));

  test('Transaction rollback', () =>
    withTestContext(async () => {
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
              expression: ['Patient.foo'],
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
      // This should return zero results because the transaction was rolled back
      const searchCheck2 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: (patient as Patient).id as string }],
      });
      expect(searchCheck2.entry).toHaveLength(0);
    }));

  test('Nested transaction commit', () =>
    withTestContext(async () => {
      let patient1: Patient | undefined;
      let patient2: Patient | undefined;

      await repo.withTransaction(async () => {
        patient1 = await repo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient1).toBeDefined();

        await repo.withTransaction(async () => {
          patient2 = await repo.createResource<Patient>({ resourceType: 'Patient' });
          expect(patient2).toBeDefined();
        });
      });
      expect(patient1).toBeDefined();
      expect(patient2).toBeDefined();

      // Read the patient by ID
      // This should succeed
      const readCheck1 = await repo.readResource('Patient', patient1?.id as string);
      expect(readCheck1).toBeDefined();

      // Search for patient by ID
      // This should succeed
      const searchCheck1 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
      });
      expect(searchCheck1.entry).toHaveLength(1);

      // Read the patient by ID
      // This should succeed
      const readCheck2 = await repo.readResource('Patient', patient2?.id as string);
      expect(readCheck2).toBeDefined();

      // Search for patient by ID
      // This should succeed
      const searchCheck2 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
      });
      expect(searchCheck2.entry).toHaveLength(1);
    }));

  test('Nested transaction rollback', () =>
    withTestContext(async () => {
      let patient1: Patient | undefined;
      let patient2: Patient | undefined;

      // Start an outer transaction - this should succeed
      await repo.withTransaction(async () => {
        // Create one patient
        // This will initially succeed, and should not be rolled back
        patient1 = await repo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient1).toBeDefined();

        try {
          // Start an inner transaction - this will be rolled back
          await repo.withTransaction(async () => {
            patient2 = await repo.createResource<Patient>({ resourceType: 'Patient' });
            expect(patient2).toBeDefined();

            // Read the patient by ID
            // This should succeed within the transaction
            const readCheck1 = await repo.readResource('Patient', patient1?.id as string);
            expect(readCheck1).toBeDefined();

            // Search for patient by ID
            // This should succeed within the transaction
            const searchCheck1 = await repo.search<Patient>({
              resourceType: 'Patient',
              filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
            });
            expect(searchCheck1).toBeDefined();
            expect(searchCheck1.entry).toHaveLength(1);

            // Read the patient by ID
            // This should succeed within the transaction
            const readCheck2 = await repo.readResource('Patient', patient2?.id as string);
            expect(readCheck2).toBeDefined();

            // Search for patient by ID
            // This should succeed within the transaction
            const searchCheck2 = await repo.search<Patient>({
              resourceType: 'Patient',
              filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
            });
            expect(searchCheck2).toBeDefined();
            expect(searchCheck2.entry).toHaveLength(1);

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
                expression: ['Patient.foo'],
              },
            ],
          });
        }

        // Read the patient by ID
        // This should succeed within the transaction
        const readCheck3 = await repo.readResource('Patient', patient1?.id as string);
        expect(readCheck3).toBeDefined();

        // Search for patient by ID
        // This should succeed within the transaction
        const searchCheck3 = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
        });
        expect(searchCheck3).toBeDefined();
        expect(searchCheck3.entry).toHaveLength(1);

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
        const searchCheck4 = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: (patient2 as Patient).id as string }],
        });
        expect(searchCheck4).toBeDefined();
        expect(searchCheck4.entry).toHaveLength(0);
      });
    }));

  test('Conflicting concurrent writes', () =>
    withTestContext(async () => {
      const existing = await repo.createResource<Patient>({ resourceType: 'Patient' });

      const tx1 = repo.withTransaction(async () => {
        await repo.updateResource({ ...existing, gender: 'unknown' });
        await sleep(500);
      });

      await sleep(250);

      const systemRepo = getSystemRepo();
      const tx2 = systemRepo.withTransaction(async () => {
        await systemRepo.updateResource({ ...existing, deceasedBoolean: false });
      });

      const results = await Promise.allSettled([tx1, tx2]);
      expect(results.map((r) => r.status)).toContain('rejected');
    }));

  test('Allowed concurrent writes', () =>
    withTestContext(async () => {
      const existing = await repo.createResource({ resourceType: 'Patient' });

      const tx1 = repo.withTransaction(
        async () => {
          await repo.updateResource({ ...existing, gender: 'unknown' });
          await sleep(500);
        },
        { isolation: 'READ COMMITTED' }
      );

      const systemRepo = getSystemRepo();
      const tx2 = systemRepo.withTransaction(
        async () => {
          await sleep(250);
          await systemRepo.updateResource({ ...existing, deceasedBoolean: false });
        },
        { isolation: 'READ COMMITTED' }
      );

      const results = await Promise.allSettled([tx1, tx2]);
      expect(results[0].status).toEqual('fulfilled');
      expect(results[1].status).toEqual('fulfilled');
    }));

  test('Conflicting concurrent conditional creates', () =>
    withTestContext(async () => {
      const identifier = randomUUID();
      const criteria = 'Patient?identifier=http://example.com/mrn|' + identifier;
      const resource: Patient = {
        resourceType: 'Patient',
        identifier: [{ system: 'http://example.com/mrn', value: identifier }],
      };
      const tx1 = repo.withTransaction(
        async () => {
          const existing = await repo.searchResources(parseSearchRequest(criteria));
          if (!existing.length) {
            await repo.createResource(resource);
          }
          await sleep(500);
        },
        { isolation: 'SERIALIZABLE' }
      );

      const systemRepo = getSystemRepo();
      const tx2 = systemRepo.withTransaction(
        async () => {
          await sleep(250);
          const existing = await systemRepo.searchResources(parseSearchRequest(criteria));
          if (!existing.length) {
            await systemRepo.createResource(resource);
          }
        },
        { isolation: 'SERIALIZABLE' }
      );

      const results = await Promise.allSettled([tx1, tx2]);
      expect(results.map((r) => r.status)).toContain('rejected');
    }));

  test('Allowed concurrent conditional creates', () =>
    withTestContext(async () => {
      const identifier = randomUUID();
      const criteria = 'Patient?identifier=http://example.com/mrn|' + identifier;
      const resource: Patient = {
        resourceType: 'Patient',
        identifier: [{ system: 'http://example.com/mrn', value: identifier }],
      };
      const tx1 = repo.withTransaction(async () => {
        const existing = await repo.searchResources(parseSearchRequest(criteria));
        if (!existing.length) {
          await repo.createResource(resource);
        }
        await sleep(500);
      });

      const systemRepo = getSystemRepo();
      const tx2 = systemRepo.withTransaction(async () => {
        await sleep(250);
        const existing = await systemRepo.searchResources(parseSearchRequest(criteria));
        if (!existing.length) {
          await systemRepo.createResource(resource);
        }
      });

      const results = await Promise.allSettled([tx1, tx2]);
      expect(results.map((r) => r.status)).not.toContain('rejected');
    }));

  test('Conflicting update with patch', () =>
    withTestContext(async () => {
      const existing = await repo.createResource<Patient>({ resourceType: 'Patient' });

      const tx1 = repo.withTransaction(async () => {
        await repo.searchResources(parseSearchRequest('Patient?_id=' + existing.id)); // Ensure request hits the DB
        await sleep(500);
        return repo.updateResource({ ...resource, gender: 'other' });
      });

      await sleep(200);

      const systemRepo = getSystemRepo();
      const tx2 = systemRepo.updateResource({ ...existing, deceasedBoolean: false });

      const results = await Promise.allSettled([tx1, tx2]);
      const resource = await repo.readResource(existing.resourceType, existing.id as string);
      expect(results.map((r) => r.status)).toContain('rejected');
    }));
});
