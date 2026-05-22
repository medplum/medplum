// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { OperationOutcomeError, Operator, conflict, notFound, parseSearchRequest, sleep } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode } from '../database';
import { createTestProject, withTestContext } from '../test.setup';
import type { Repository, SystemRepository } from './repo';
import { PostgresError } from './sql';

describe('FHIR Repo Transactions', () => {
  let repo: Repository;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
    systemRepo = repo.getSystemRepo();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Transaction commit', () =>
    withTestContext(async () => {
      let patient: Patient | undefined;
      await repo.withTransaction(async (txRepo) => {
        patient = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
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

  test('invoking repository rejects operations during active transaction callback', () =>
    withTestContext(async () => {
      let patient: Patient | undefined;

      await repo.withTransaction(async (txRepo) => {
        // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
        expect(() => repo.getDatabaseClient(DatabaseMode.WRITER)).toThrow('transaction-scoped repository');
        // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
        await expect(repo.createResource<Patient>({ resourceType: 'Patient' })).rejects.toThrow(
          'transaction-scoped repository'
        );
        // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
        await expect(repo.searchResources(parseSearchRequest('Patient'))).rejects.toThrow(
          'transaction-scoped repository'
        );

        patient = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
      });

      expect(patient).toBeDefined();
    }));

  test('ensureInTransaction callback must use the scoped repository when starting transaction', () =>
    withTestContext(async () => {
      const patient = await repo.ensureInTransaction(async (txRepo) => {
        // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies scoped repo identity.
        expect(txRepo).not.toBe(repo);
        // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
        await expect(repo.createResource<Patient>({ resourceType: 'Patient' })).rejects.toThrow(
          'transaction-scoped repository'
        );

        return txRepo.createResource<Patient>({ resourceType: 'Patient' });
      });

      expect(patient).toBeDefined();
    }));

  test('ensureInTransaction passes the current repository inside transaction', () =>
    withTestContext(async () => {
      await repo.withTransaction(async (txRepo) => {
        const patient = await txRepo.ensureInTransaction(async (ensuredRepo) => {
          // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies scoped repo identity.
          expect(ensuredRepo).toBe(txRepo);
          return ensuredRepo.createResource<Patient>({ resourceType: 'Patient' });
        });

        expect(patient).toBeDefined();
      });
    }));

  test('Transaction rollback', () =>
    withTestContext(async () => {
      let patient: WithId<Patient> | undefined;

      await expect(
        repo.withTransaction(async (txRepo) => {
          // Create one patient
          // This will initially succeed, but should then be rolled back
          patient = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
          expect(patient).toBeDefined();

          // Read the patient by ID
          // This should succeed within the transaction
          const readCheck1 = await txRepo.readResource('Patient', patient.id);
          expect(readCheck1).toBeDefined();

          // Search for patient by ID
          // This should succeed within the transaction
          const searchCheck1 = await txRepo.search<Patient>({
            resourceType: 'Patient',
            filters: [{ code: '_id', operator: Operator.EQUALS, value: patient.id }],
          });
          expect(searchCheck1.entry).toHaveLength(1);

          // Now try to create a malformed patient
          // This will fail, and should rollback the entire transaction
          await txRepo.createResource({ resourceType: 'Patient', foo: 'bar' } as unknown as Patient);
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

      await repo.withTransaction(async (txRepo) => {
        patient1 = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient1).toBeDefined();

        await txRepo.withTransaction(async (nestedRepo) => {
          patient2 = await nestedRepo.createResource<Patient>({ resourceType: 'Patient' });
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
      await repo.withTransaction(async (txRepo) => {
        // Create one patient
        // This will initially succeed, and should not be rolled back
        patient1 = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient1).toBeDefined();

        // Start an inner transaction - this will be rolled back
        await expect(
          txRepo.withTransaction(async (nestedRepo) => {
            patient2 = await nestedRepo.createResource<Patient>({ resourceType: 'Patient' });
            expect(patient2).toBeDefined();

            // Read the patient by ID
            // This should succeed within the transaction
            const readCheck1 = await nestedRepo.readResource('Patient', patient1?.id as string);
            expect(readCheck1).toBeDefined();

            // Search for patient by ID
            // This should succeed within the transaction
            const searchCheck1 = await nestedRepo.search<Patient>({
              resourceType: 'Patient',
              filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
            });
            expect(searchCheck1).toBeDefined();
            expect(searchCheck1.entry).toHaveLength(1);

            // Read the patient by ID
            // This should succeed within the transaction
            const readCheck2 = await nestedRepo.readResource('Patient', patient2?.id as string);
            expect(readCheck2).toBeDefined();

            // Search for patient by ID
            // This should succeed within the transaction
            const searchCheck2 = await nestedRepo.search<Patient>({
              resourceType: 'Patient',
              filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
            });
            expect(searchCheck2).toBeDefined();
            expect(searchCheck2.entry).toHaveLength(1);

            // Now try to create a malformed patient
            // This will fail, and should rollback the entire transaction
            await nestedRepo.createResource({ resourceType: 'Patient', foo: 'bar' } as unknown as Patient);
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
        const readCheck3 = await txRepo.readResource('Patient', patient1?.id as string);
        expect(readCheck3).toBeDefined();

        // Search for patient by ID
        // This should succeed within the transaction
        const searchCheck3 = await txRepo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
        });
        expect(searchCheck3).toBeDefined();
        expect(searchCheck3.entry).toHaveLength(1);

        // Read the patient by ID
        // This should fail, because the transaction was rolled back
        await expect(txRepo.readResource('Patient', patient2?.id as string)).rejects.toThrow('Not found');

        // Search for patient by ID
        // This should succeed within the transaction
        const searchCheck4 = await txRepo.search<Patient>({
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
      await repo.withTransaction(async (txRepo) => {
        // Create one patient
        // This will initially succeed, and should not be rolled back
        patient1 = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient1).toBeDefined();

        // Start an inner transaction - this will be rolled back
        await expect(
          txRepo.withTransaction(async (nestedRepo) => {
            patient2 = await nestedRepo.createResource<Patient>({ resourceType: 'Patient' });
            expect(patient2).toBeDefined();

            // Read the patient by ID
            // This should succeed within the transaction
            const readCheck1 = await nestedRepo.readResource('Patient', patient1?.id as string);
            expect(readCheck1).toBeDefined();

            // Search for patient by ID
            // This should succeed within the transaction
            const searchCheck1 = await nestedRepo.search<Patient>({
              resourceType: 'Patient',
              filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
            });
            expect(searchCheck1).toBeDefined();
            expect(searchCheck1.entry).toHaveLength(1);

            // Read the patient by ID
            // This should succeed within the transaction
            const readCheck2 = await nestedRepo.readResource('Patient', patient2?.id as string);
            expect(readCheck2).toBeDefined();

            // Search for patient by ID
            // This should succeed within the transaction
            const searchPreCheck = await nestedRepo.search<Patient>({
              resourceType: 'Patient',
              filters: [{ code: '_id', operator: Operator.EQUALS, value: patient2?.id as string }],
            });
            expect(searchPreCheck).toBeDefined();
            expect(searchPreCheck.entry).toHaveLength(1);

            const db = nestedRepo.getDatabaseClient(DatabaseMode.READER);
            await expect(db.query(`SELECT * FROM "TableDoesNotExist"`)).rejects.toMatchObject({
              message: 'relation "TableDoesNotExist" does not exist',
            });
          })
        ).rejects.toThrow('current transaction is aborted, commands ignored until end of transaction block');

        // Read the patient by ID
        // This should succeed within the transaction
        const readCheck3 = await txRepo.readResource('Patient', patient1?.id as string);
        expect(readCheck3).toBeDefined();

        // Search for patient by ID
        // This should succeed within the transaction
        const searchCheck3 = await txRepo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: patient1?.id as string }],
        });
        expect(searchCheck3).toBeDefined();
        expect(searchCheck3.entry).toHaveLength(1);

        // Read the patient by ID
        // This should fail, because the transaction was rolled back
        await expect(txRepo.readResource('Patient', patient2?.id as string)).rejects.toMatchObject({
          outcome: notFound,
        });

        // Search for patient by ID
        // This should return no results, because the transaction was rolled back
        const searchCheck4 = await txRepo.search<Patient>({
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
      await repo.withTransaction(async (txRepo) => {
        await txRepo.postCommit(async () => {
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
        await repo.withTransaction(async (txRepo) => {
          await txRepo.postCommit(async () => {
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
      await repo.withTransaction(async (txRepo) => {
        await txRepo.postCommit(async () => {
          cb1();
        });
        await txRepo.withTransaction(async (nestedRepo) => {
          await nestedRepo.postCommit(async () => {
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

  test('getSystemRepo() shares parent post-commit state', () =>
    withTestContext(async () => {
      const callback = jest.fn();
      let calledBeforeCommit = false;

      await repo.withTransaction(async (txRepo) => {
        await txRepo.getSystemRepo().postCommit(callback);
        calledBeforeCommit = callback.mock.calls.length > 0;
      });

      expect(calledBeforeCommit).toBe(false);
      expect(callback).toHaveBeenCalledTimes(1);
    }));

  test('getSystemRepo() withTransaction() nests in the parent transaction', () =>
    withTestContext(async () => {
      let queries: string[] = [];

      await repo.withTransaction(async (txRepo) => {
        const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
        const querySpy = jest.spyOn(client, 'query');
        try {
          await txRepo.getSystemRepo().withTransaction(async () => undefined);
        } finally {
          queries = querySpy.mock.calls.map(([query]) =>
            typeof query === 'string' ? query : (query as { text: string }).text
          );
          querySpy.mockRestore();
        }
      });

      expect(queries).toContain('SAVEPOINT sp2');
      expect(queries).toContain('RELEASE SAVEPOINT sp2');
      expect(queries).not.toContain('BEGIN ISOLATION LEVEL REPEATABLE READ');
      expect(queries).not.toContain('COMMIT');
    }));

  test('getSystemRepo() defers cache writes while parent transaction is active', () =>
    withTestContext(async () => {
      let patient: WithId<Patient> | undefined;
      let cacheReadDuringTransaction = false;

      await repo.withTransaction(async (txRepo) => {
        patient = await txRepo.getSystemRepo().createResource<Patient>({ resourceType: 'Patient' });
        try {
          await systemRepo.readResource<Patient>('Patient', patient.id, { checkCacheOnly: true });
          cacheReadDuringTransaction = true;
        } catch {
          cacheReadDuringTransaction = false;
        }
      });

      expect(cacheReadDuringTransaction).toBe(false);
      assert(patient);
      await expect(
        systemRepo.readResource<Patient>('Patient', patient.id, { checkCacheOnly: true })
      ).resolves.toBeDefined();
    }));

  test('clone() does NOT share parent transaction state', () =>
    withTestContext(async () => {
      const callbackFn = jest.fn();
      let patient: WithId<Patient> | undefined;
      await expect(
        repo.withTransaction(async (txRepo) => {
          const clonedRepo = txRepo.clone();
          patient = await clonedRepo.createResource<Patient>({ resourceType: 'Patient' });
          await clonedRepo.postCommit(callbackFn);
          expect(callbackFn).toHaveBeenCalledTimes(1);
          throw new Error('rollback clone transaction');
        })
      ).rejects.toThrow('rollback clone transaction');

      expect(callbackFn).toHaveBeenCalledTimes(1);
      assert(patient);
      await expect(repo.readResource('Patient', patient.id)).resolves.toStrictEqual(patient);
    }));

  test('Conflicting concurrent writes', () =>
    withTestContext(async () => {
      const existing = await repo.createResource<Patient>({ resourceType: 'Patient' });

      const tx1 = repo.withTransaction(async (txRepo) => {
        await txRepo.updateResource({ ...existing, gender: 'unknown' });
        await sleep(500);
      });

      await sleep(250);

      const tx2 = systemRepo.withTransaction(async (txRepo) => {
        await txRepo.updateResource({ ...existing, deceasedBoolean: false });
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
        async (txRepo) => {
          const existing = await txRepo.searchResources(parseSearchRequest(criteria));
          if (!existing.length) {
            await txRepo.createResource(resource);
          }
          await sleep(500);
        },
        { serializable: true }
      );

      const tx2 = systemRepo.withTransaction(
        async (txRepo) => {
          await sleep(250);
          const existing = await txRepo.searchResources(parseSearchRequest(criteria));
          if (!existing.length) {
            await txRepo.createResource(resource);
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
      const tx1 = repo.withTransaction(async (txRepo) => {
        const existing = await txRepo.searchResources(parseSearchRequest(criteria));
        if (!existing.length) {
          await txRepo.createResource(resource);
        }
        await sleep(500);
      });

      const tx2 = systemRepo.withTransaction(async (txRepo) => {
        await sleep(250);
        const existing = await txRepo.searchResources(parseSearchRequest(criteria));
        if (!existing.length) {
          await txRepo.createResource(resource);
        }
      });

      const results = await Promise.allSettled([tx1, tx2]);
      expect(results.map((r) => r.status)).not.toContain('rejected');
    }));

  test('Conflicting update with patch', () =>
    withTestContext(async () => {
      const existing = await repo.createResource<Patient>({ resourceType: 'Patient' });

      // Simulate patch operation with long delay in the middle to ensure conflict
      const tx1 = repo.withTransaction(async (txRepo) => {
        await txRepo.searchResources(parseSearchRequest('Patient?_id=' + existing.id)); // Ensure request hits the DB
        await sleep(500);
        return txRepo.updateResource({ ...existing, gender: 'other' });
      });

      await sleep(200);

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
          throw new OperationOutcomeError(conflict('transaction', PostgresError.SerializationFailure));
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
          const outcome = conflict('transaction conflict', PostgresError.SerializationFailure);
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
        throw new OperationOutcomeError(conflict('transaction conflict', PostgresError.SerializationFailure));
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
          throw new OperationOutcomeError(conflict('transaction', PostgresError.SerializationFailure));
        }
      });
      const outerTx = jest.fn(async (txRepo): Promise<boolean> => txRepo.withTransaction(txFn));

      await expect(repo.withTransaction(outerTx)).resolves.toStrictEqual(true);
      expect(txFn).toHaveBeenCalledTimes(2);
      expect(outerTx).toHaveBeenCalledTimes(2);
    }));

  test('Retry nested transaction to failure', () =>
    withTestContext(async () => {
      const txFn = jest.fn(async (): Promise<boolean> => {
        // Emit transaction conflict (Postgres error code 40001)
        throw new OperationOutcomeError(conflict('transaction conflict', PostgresError.SerializationFailure));
      });
      const outerTx = jest.fn(async (txRepo): Promise<boolean> => txRepo.withTransaction(txFn));

      await expect(repo.withTransaction(outerTx)).rejects.toThrow('transaction conflict');
      expect(txFn).toHaveBeenCalledTimes(2);
      expect(outerTx).toHaveBeenCalledTimes(2);
    }));

  test('Nested transaction does not retry independently', () =>
    withTestContext(async () => {
      const txFn = jest.fn(async (): Promise<boolean> => {
        // Emit transaction conflict (Postgres error code 40001)
        throw new OperationOutcomeError(conflict('transaction conflict', PostgresError.SerializationFailure));
      });
      const outerTx = jest.fn(async (txRepo): Promise<boolean> => {
        try {
          await txRepo.withTransaction(txFn);
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
