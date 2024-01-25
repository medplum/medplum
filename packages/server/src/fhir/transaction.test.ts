import { OperationOutcomeError, Operator } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { withTestContext } from '../test.setup';
import { Repository } from './repo';

describe('FHIR Repo', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    const clientApp = 'ClientApplication/' + randomUUID();
    const projectId = randomUUID();
    repo = new Repository({
      extendedMode: true,
      project: projectId,
      author: {
        reference: clientApp,
      },
    });
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
                expression: ['foo'],
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
});
