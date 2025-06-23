import { OperationOutcomeError, Operator, WithId, conflict, notFound, parseSearchRequest, sleep } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { Repository, getSystemRepo } from './repo';

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
      let patient: WithId<Patient> | undefined;

      await expect(
        repo.withTransaction(async () => {
          // Create one patient
          // This will initially succeed, but should then be rolled back
          patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
          expect(patient).toBeDefined();

          // Read the patient by ID
          // This should succeed within the transaction
          const readCheck1 = await repo.readResource('Patient', patient.id);
          expect(readCheck1).toBeDefined();

          // Search for patient by ID
          // This should succeed within the transaction
          const searchCheck1 = await repo.search<Patient>({
            resourceType: 'Patient',
            filters: [{ code: '_id', operator: Operator.EQUALS, value: patient.id }],
          });
          expect(searchCheck1.entry).toHaveLength(1);

          // Now try to create a malformed patient
          // This will fail, and should rollback the entire transaction
          await repo.createResource<Patient>({ resourceType: 'Patient', foo: 'bar' } as unknown as Patient);
        })
      ).rejects.toMatchObject(
        new OperationOutcomeError({
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
        })
      );

      // Read the patient by ID
      // This should fail, because the transaction was rolled back
      await expect(repo.readResource('Patient', patient?.id as string)).rejects.toThrow('Not found');

      // Search for patient by ID
      // This should return zero results because the transaction was rolled back
      const searchCheck2 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient?.id as string }],
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

        // Start an inner transaction - this will be rolled back
        await expect(
          repo.withTransaction(async () => {
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
          })
        ).rejects.toMatchObject(
          new OperationOutcomeError({
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
          })
        );

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
        await expect(repo.readResource('Patient', patient2?.id as string)).rejects.toThrow('Not found');

        // Search for patient by ID
        // This should succeed within the transaction
        const searchCheck4 = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
        });
        expect(searchCheck4).toBeDefined();
        expect(searchCheck4.entry).toHaveLength(0);
      });
    }));

  test('Nested transaction rollback from DB error', () =>
    withTestContext(async () => {
      let patient1: Patient | undefined;
      let patient2: Patient | undefined;

      // Start an outer transaction - this should succeed
      await repo.withTransaction(async () => {
        // Create one patient
        // This will initially succeed, and should not be rolled back
        patient1 = await repo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient1).toBeDefined();

        // Start an inner transaction - this will be rolled back
        await expect(
          repo.withTransaction(async (db) => {
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
            const searchPreCheck = await repo.search<Patient>({
              resourceType: 'Patient',
              filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
            });
            expect(searchPreCheck).toBeDefined();
            expect(searchPreCheck.entry).toHaveLength(1);

            await expect(db.query(`SELECT * FROM "TableDoesNotExist"`)).rejects.toMatchObject({
              message: 'relation "TableDoesNotExist" does not exist',
            });
          })
        ).rejects.toThrow('current transaction is aborted, commands ignored until end of transaction block');

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
        await expect(repo.readResource('Patient', patient2?.id as string)).rejects.toMatchObject({
          outcome: notFound,
        });

        // Search for patient by ID
        // This should return no results, because the transaction was rolled back
        const searchCheck4 = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
        });
        expect(searchCheck4).toBeDefined();
        expect(searchCheck4.entry).toHaveLength(0);
      });

      // Search for patient by ID
      // This should succeed outside the transaction
      const searchCheck3 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
      });
      expect(searchCheck3).toBeDefined();
      expect(searchCheck3.entry).toHaveLength(1);

      // Search for patient by ID
      // This should return no results, because the transaction was rolled back
      const searchCheck4 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
      });
      expect(searchCheck4).toBeDefined();
      expect(searchCheck4.entry).toHaveLength(0);
    }));

  test('Post-commit callback', () =>
    withTestContext(async () => {
      const callback = jest.fn();
      await repo.withTransaction(async () => {
        await repo.postCommit(async () => {
          callback();
        });
        expect(callback).not.toHaveBeenCalled();
      });
      expect(callback).toHaveBeenCalledTimes(1);
    }));

  test('Post-commit callback with rollback', () =>
    withTestContext(async () => {
      const callback = jest.fn();
      try {
        await repo.withTransaction(async () => {
          await repo.postCommit(async () => {
            callback();
          });
          expect(callback).not.toHaveBeenCalled();
          throw new Error('Roll it back!');
        });
        fail('Expected transaction to abort');
      } catch (err) {
        expect(err).toBeDefined();
        expect(callback).not.toHaveBeenCalled();
      }
    }));

  test('Nested transaction post-commit', () =>
    withTestContext(async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      await repo.withTransaction(async () => {
        await repo.postCommit(async () => {
          cb1();
        });
        await repo.withTransaction(async () => {
          await repo.postCommit(async () => {
            cb2();
          });
          expect(cb1).not.toHaveBeenCalled();
        });
        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).not.toHaveBeenCalled();
      });
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
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
      expect(results.map((r) => r.status)).not.toContain('rejected');
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
        { serializable: true }
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
        { serializable: true }
      );

      const results = await Promise.allSettled([tx1, tx2]);
      expect(results.map((r) => r.status)).not.toContain('rejected');
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

      // Simulate patch operation with long delay in the middle to ensure conflict
      const tx1 = repo.withTransaction(async () => {
        await repo.searchResources(parseSearchRequest('Patient?_id=' + existing.id)); // Ensure request hits the DB
        await sleep(500);
        return repo.updateResource({ ...existing, gender: 'other' });
      });

      await sleep(200);

      const systemRepo = getSystemRepo();
      const tx2 = systemRepo.updateResource({ ...existing, deceasedBoolean: false });

      const results = await Promise.allSettled([tx1, tx2]);
      await expect(repo.readResource(existing.resourceType, existing.id)).resolves.toBeDefined();
      expect(results.map((r) => r.status)).not.toContain('rejected');
    }));

  test('Retry on conflict', () =>
    withTestContext(async () => {
      let returnValue: boolean | undefined;
      const txFn = jest.fn(async (): Promise<boolean> => {
        if (returnValue) {
          return returnValue;
        } else {
          returnValue = true;
          // Emit transaction conflict (Postgres error code 40001)
          throw new OperationOutcomeError(conflict('transaction', '40001'));
        }
      });

      await expect(repo.withTransaction(txFn)).resolves.toStrictEqual(true);
      expect(txFn).toHaveBeenCalledTimes(2);
    }));

  test('Only retry specific transaction conflict', () =>
    withTestContext(async () => {
      let returnValue: boolean | undefined;
      const txFn = jest.fn(async (): Promise<boolean> => {
        if (returnValue) {
          return returnValue;
        } else {
          returnValue = true;
          // Emit some other conflict
          throw new OperationOutcomeError(conflict('a different conflict', 'other-error'));
        }
      });

      await expect(repo.withTransaction(txFn)).rejects.toThrow('a different conflict');
      expect(txFn).toHaveBeenCalledTimes(1);
    }));

  test('Do not retry combined transaction conflict and other errors', () =>
    withTestContext(async () => {
      let returnValue: boolean | undefined;
      const txFn = jest.fn(async (): Promise<boolean> => {
        if (returnValue) {
          return returnValue;
        } else {
          returnValue = true;
          // Emit combined errors
          const outcome = conflict('transaction conflict', '40001');
          outcome.issue.push({ code: 'invalid', severity: 'error', details: { text: 'invalid data' } });
          throw new OperationOutcomeError(outcome);
        }
      });

      await expect(repo.withTransaction(txFn)).rejects.toThrow('transaction conflict; invalid data');
      expect(txFn).toHaveBeenCalledTimes(1);
    }));

  test('Retry transaction only once before emitting failure', () =>
    withTestContext(async () => {
      const txFn = jest.fn(async (): Promise<boolean> => {
        // Emit transaction conflict (Postgres error code 40001)
        throw new OperationOutcomeError(conflict('transaction conflict', '40001'));
      });

      await expect(repo.withTransaction(txFn)).rejects.toThrow('transaction conflict');
      expect(txFn).toHaveBeenCalledTimes(2);
    }));

  test('Retry nested transaction', () =>
    withTestContext(async () => {
      let returnValue: boolean | undefined;
      const txFn = jest.fn(async (): Promise<boolean> => {
        if (returnValue) {
          return returnValue;
        } else {
          returnValue = true;
          // Emit transaction conflict (Postgres error code 40001)
          throw new OperationOutcomeError(conflict('transaction', '40001'));
        }
      });
      const outerTx = jest.fn(async (): Promise<boolean> => repo.withTransaction(txFn));

      await expect(repo.withTransaction(outerTx)).resolves.toStrictEqual(true);
      expect(txFn).toHaveBeenCalledTimes(2);
      expect(outerTx).toHaveBeenCalledTimes(2);
    }));

  test('Retry nested transaction to failure', () =>
    withTestContext(async () => {
      const txFn = jest.fn(async (): Promise<boolean> => {
        // Emit transaction conflict (Postgres error code 40001)
        throw new OperationOutcomeError(conflict('transaction conflict', '40001'));
      });
      const outerTx = jest.fn(async (): Promise<boolean> => repo.withTransaction(txFn));

      await expect(repo.withTransaction(outerTx)).rejects.toThrow('transaction conflict');
      expect(txFn).toHaveBeenCalledTimes(2);
      expect(outerTx).toHaveBeenCalledTimes(2);
    }));

  test('Nested transaction does not retry independently', () =>
    withTestContext(async () => {
      const txFn = jest.fn(async (): Promise<boolean> => {
        // Emit transaction conflict (Postgres error code 40001)
        throw new OperationOutcomeError(conflict('transaction conflict', '40001'));
      });
      const outerTx = jest.fn(async (): Promise<boolean> => {
        try {
          await repo.withTransaction(txFn);
          return true;
        } catch (_) {
          // Swallow the error
          return false;
        }
      });

      await expect(repo.withTransaction(outerTx)).resolves.toStrictEqual(false);
      expect(txFn).toHaveBeenCalledTimes(1);
      expect(outerTx).toHaveBeenCalledTimes(1);
    }));
});
