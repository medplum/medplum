// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  conflict,
  createReference,
  notFound,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  sleep,
} from '@medplum/core';
import type { Patient, UserConfiguration } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { NIL } from 'uuid';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode } from '../database';
import { getLogger } from '../logger';
import { createTestProject, withTestContext } from '../test.setup';
import * as workersModule from '../workers';
import { getRepoForLogin } from './accesspolicy';
import type { SystemRepository } from './repo';
import { getShardSystemRepo, Repository } from './repo';
import { RepositoryConnection } from './repository/repository-connection';
import type { PgQueryable } from './sql';
import { PostgresError, setSqlDebug } from './sql';

type RepositoryDatabaseClient = PgQueryable;
type TransactionDatabaseClient = PoolClient;
type MemberKind = 'method' | 'getter' | 'setter';

type IsAssignable<T, U> = [T] extends [U] ? true : false;
type IsNotAssignable<T, U> = IsAssignable<T, U> extends true ? false : true;

function assertType<_T extends true>(): undefined {
  // Compile-time only.
  return undefined;
}

class SpecializedRepository extends Repository {
  getSubclassValue(): string {
    return 'ok';
  }
}

/**
 * Methods that are intentionally not guarded by assertUsable().
 *
 * The remainder of public methods/getters/setters on Repository and inherited concrete
 * methods on FhirRepository MUST call assertUsable() at their entry point so that
 * operations on the parent repository fail while a transaction callback is active.
 */
const unguardedMembers = new Set<PropertyKey>([
  'constructor',
  'effectiveAccessPolicy',
  'mode',
  'shardId',
  'currentProject',
  'getConfig',
  'isSuperAdmin',
  'isProjectAdmin',
  'supportsRangeSearch',
  'supportsInteraction',
  'canPerformInteraction',
  'getAuthor',
  'removeHiddenFields',
  'generateId',
  'addDeletedFilter',
  'addSecurityFilters',
]);

/**
 * Private methods on Repository need not be guarded. Listing them explicitly forces
 * any new method added to Repository to be classified as guarded, unguarded, or private.
 */
const knownPrivateMembers = new Set<PropertyKey>([
  'rateLimiter',
  'resourceCap',
  'getProjectById',
  'readResourceImpl',
  'readResourceFromDatabase',
  'processReadReferenceEntry',
  'checkResourcePermissions',
  'updateResourceImpl',
  'handleBinaryUpdate',
  'handleBinaryData',
  'handleStorage',
  'writeToDatabase',
  'checkExistingResource',
  'isNotModified',
  'getPermittedProjectIds',
  'addProjectFilters',
  'addAccessPolicyFilters',
  'writeResource',
  'batchWriteResources',
  'writeResourceVersion',
  'getCompartments',
  'writeLookupTables',
  'batchWriteLookupTables',
  'deleteFromLookupTables',
  'getLastUpdated',
  'getProjectId',
  'getAccounts',
  'canSetId',
  'canWriteProtectedMeta',
  'canWriteAccount',
  'isResourceWriteable',
  'isCacheOnly',
  'restoreReadonlyFields',
  'logEvent',
  'getCacheEntry',
  'getCacheEntries',
  'setCacheEntry',
  'deleteCacheEntry',
  'deleteCacheEntries',
  'createTransactionScopedRepo',
  'assertUsable',
]);

interface MethodInvocation {
  name: PropertyKey;
  kind: MemberKind;
  invoke: (repo: Repository) => unknown;
}

const guardedPatient: WithId<Patient> = { resourceType: 'Patient', id: NIL };

/**
 * Representative invocations for each guarded public method/getter/setter. Each invocation
 * must reach the assertUsable() guard before performing any real work, so the parent repo
 * is rejected during a transaction callback regardless of argument validity.
 */
const guardedInvocations: MethodInvocation[] = [
  // Connection / transaction helpers
  { name: 'clone', kind: 'method', invoke: (repo) => repo.clone() },
  { name: 'getSystemRepo', kind: 'method', invoke: (repo) => repo.getSystemRepo() },
  { name: 'setMode', kind: 'method', invoke: (repo) => repo.setMode('reader') },
  { name: 'getDatabaseClient', kind: 'method', invoke: (repo) => repo.getDatabaseClient(DatabaseMode.WRITER) },
  { name: 'withTransaction', kind: 'method', invoke: (repo) => repo.withTransaction(async () => undefined) },
  { name: 'withOverrideConfig', kind: 'method', invoke: (repo) => repo.withOverrideConfig({ extendedMode: true }) },
  {
    name: 'withStatementTimeout',
    kind: 'method',
    invoke: (repo) => repo.withStatementTimeout({ timeoutMs: 1 }, async () => undefined),
  },
  { name: 'preCommit', kind: 'method', invoke: (repo) => repo.preCommit(async () => undefined) },
  { name: 'postCommit', kind: 'method', invoke: (repo) => repo.postCommit(async () => undefined) },
  { name: 'ensureInTransaction', kind: 'method', invoke: (repo) => repo.ensureInTransaction(async () => undefined) },

  // Reads
  {
    name: 'readResource',
    kind: 'method',
    invoke: (repo) => repo.readResource<Patient>('Patient', guardedPatient.id),
  },
  {
    name: 'readReference',
    kind: 'method',
    invoke: (repo) => repo.readReference<Patient>(createReference<Patient>(guardedPatient)),
  },
  {
    name: 'readReferences',
    kind: 'method',
    invoke: (repo) => repo.readReferences<Patient>([createReference<Patient>(guardedPatient)]),
  },
  {
    name: 'readHistory',
    kind: 'method',
    invoke: (repo) => repo.readHistory<Patient>('Patient', guardedPatient.id),
  },
  {
    name: 'readVersion',
    kind: 'method',
    invoke: (repo) => repo.readVersion<Patient>('Patient', guardedPatient.id, NIL),
  },

  // Writes
  {
    name: 'createResource',
    kind: 'method',
    invoke: (repo) => repo.createResource<Patient>({ resourceType: 'Patient' }),
  },
  {
    name: 'updateResource',
    kind: 'method',
    invoke: (repo) => repo.updateResource<Patient>(guardedPatient),
  },
  {
    name: 'patchResource',
    kind: 'method',
    invoke: (repo) => repo.patchResource<Patient>('Patient', guardedPatient.id, []),
  },
  {
    name: 'deleteResource',
    kind: 'method',
    invoke: (repo) => repo.deleteResource('Patient', guardedPatient.id),
  },
  {
    name: 'reindexResource',
    kind: 'method',
    invoke: (repo) => repo.reindexResource<Patient>('Patient', guardedPatient.id),
  },
  { name: 'reindexResources', kind: 'method', invoke: (repo) => repo.reindexResources<Patient>([]) },
  {
    name: 'resendSubscriptions',
    kind: 'method',
    invoke: (repo) => repo.resendSubscriptions('Patient', guardedPatient.id),
  },
  {
    name: 'expungeResource',
    kind: 'method',
    invoke: (repo) => repo.expungeResource('Patient', guardedPatient.id),
  },
  { name: 'expungeResources', kind: 'method', invoke: (repo) => repo.expungeResources('Patient', []) },
  {
    name: 'purgeResources',
    kind: 'method',
    invoke: (repo) => repo.purgeResources('Patient', new Date().toISOString()),
  },

  // Search
  {
    name: 'search',
    kind: 'method',
    invoke: (repo) => repo.search<Patient>(parseSearchRequest('Patient')),
  },
  {
    name: 'processAllResources',
    kind: 'method',
    invoke: (repo) => repo.processAllResources<Patient>(parseSearchRequest('Patient'), async () => undefined),
  },
  {
    name: 'searchByReference',
    kind: 'method',
    invoke: (repo) => repo.searchByReference<Patient>(parseSearchRequest('Patient'), 'subject', []),
  },

  // Inherited FhirRepository helpers
  { name: 'searchOne', kind: 'method', invoke: (repo) => repo.searchOne<Patient>(parseSearchRequest('Patient')) },
  {
    name: 'searchResources',
    kind: 'method',
    invoke: (repo) => repo.searchResources<Patient>(parseSearchRequest('Patient')),
  },
  {
    name: 'conditionalCreate',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalCreate<Patient>(
        { resourceType: 'Patient' },
        {
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: guardedPatient.id }],
        }
      ),
  },
  {
    name: 'conditionalUpdate',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalUpdate<Patient>(guardedPatient, {
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: guardedPatient.id }],
      }),
  },
  {
    name: 'conditionalDelete',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalDelete({
        resourceType: 'Patient',
        filters: [{ code: '_id', operator: Operator.EQUALS, value: guardedPatient.id }],
      }),
  },
  {
    name: 'conditionalPatch',
    kind: 'method',
    invoke: (repo) =>
      repo.conditionalPatch(
        {
          resourceType: 'Patient',
          filters: [{ code: '_id', operator: Operator.EQUALS, value: guardedPatient.id }],
        },
        []
      ),
  },

  // Disposal
  { name: Symbol.dispose, kind: 'method', invoke: (repo) => repo[Symbol.dispose]() },
];

async function assertRepositoryDatabaseClientTypes(repo: Repository, systemRepo: SystemRepository): Promise<void> {
  const topLevelClient = repo.getDatabaseClient(DatabaseMode.WRITER);
  assert(topLevelClient);
  assertType<IsAssignable<typeof topLevelClient, RepositoryDatabaseClient>>();
  assertType<IsNotAssignable<typeof topLevelClient, TransactionDatabaseClient>>();

  const specializedRepo = new SpecializedRepository(repo.getConfig());
  try {
    await specializedRepo.withTransaction(async (txRepo) => {
      expect(txRepo.getSubclassValue()).toBe('ok');
      const txClient = txRepo.getDatabaseClient(DatabaseMode.WRITER);
      assertType<IsAssignable<typeof txClient, TransactionDatabaseClient>>();
      expect(txClient).toBeDefined();
    });
  } finally {
    specializedRepo[Symbol.dispose]();
  }

  await repo.withTransaction(async (txRepo) => {
    const txClient = txRepo.getDatabaseClient(DatabaseMode.WRITER);
    assert(txClient);
    assertType<IsAssignable<typeof txClient, RepositoryDatabaseClient>>();
    assertType<IsAssignable<typeof txClient, TransactionDatabaseClient>>();

    await txRepo.withTransaction(async (nestedTxRepo) => {
      const nestedTxClient = nestedTxRepo.getDatabaseClient(DatabaseMode.READER);
      assert(nestedTxClient);
      assertType<IsAssignable<typeof nestedTxClient, RepositoryDatabaseClient>>();
      assertType<IsAssignable<typeof nestedTxClient, TransactionDatabaseClient>>();
    });

    await txRepo.ensureInTransaction(async (ensuredTxRepo) => {
      const ensuredTxClient = ensuredTxRepo.getDatabaseClient(DatabaseMode.WRITER);
      assert(ensuredTxClient);
      assertType<IsAssignable<typeof ensuredTxClient, TransactionDatabaseClient>>();
    });

    const txSystemRepo = txRepo.getSystemRepo();
    const txSystemClient = txSystemRepo.getDatabaseClient(DatabaseMode.WRITER);
    assert(txSystemClient);
    assertType<IsAssignable<typeof txSystemClient, RepositoryDatabaseClient>>();
    assertType<IsAssignable<typeof txSystemClient, TransactionDatabaseClient>>();
  });

  await systemRepo.withTransaction(async (txSystemRepo) => {
    const txSystemClient = txSystemRepo.getDatabaseClient(DatabaseMode.WRITER);
    assert(txSystemClient);
    assertType<IsAssignable<typeof txSystemClient, RepositoryDatabaseClient>>();
    assertType<IsAssignable<typeof txSystemClient, TransactionDatabaseClient>>();
  });
}

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

  test('database client types distinguish repository and transaction scopes', () =>
    withTestContext(async () => {
      await assertRepositoryDatabaseClientTypes(repo, systemRepo);
    }));

  test('Transaction commit', () =>
    withTestContext(async () => {
      let patient: Patient | undefined;
      await repo.withTransaction(async (txRepo) => {
        patient = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
        expect(patient).toBeDefined();
      });
      expect(patient).toBeDefined();

      await expectPatientVisible(repo, patient?.id);
    }));

  test('withTransaction double calls', async () => {
    const cb1 = jest.fn().mockReturnValue('first success');
    const cb2 = jest.fn().mockReturnValue('second success');
    const promise1 = repo.withTransaction(cb1);
    const promise2 = repo.withTransaction(cb2);

    const [result1, result2] = await Promise.allSettled([promise1, promise2]);
    assert(result1.status === 'fulfilled');
    expect(result1.value).toBe('first success');
    expect(cb1).toHaveBeenCalledTimes(1);

    assert(result2.status === 'rejected');
    expect((result2.reason as Error).message).toContain('transaction-scoped repository');
    expect(cb2).toHaveBeenCalledTimes(0);
  });

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
          await expectPatientVisible(txRepo, patient.id);

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

      await expectPatientAbsent(repo, patient?.id);
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

      await expectPatientVisible(repo, patient1?.id);
      await expectPatientVisible(repo, patient2?.id);
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

            await expectPatientVisible(nestedRepo, patient1?.id);
            await expectPatientVisible(nestedRepo, patient2?.id);

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

        await expectPatientVisible(txRepo, patient1?.id);
        await expectPatientAbsent(txRepo, patient2?.id);
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

            await expectPatientVisible(nestedRepo, patient1?.id);
            await expectPatientVisible(nestedRepo, patient2?.id);

            const db = nestedRepo.getDatabaseClient(DatabaseMode.READER);
            await expect(db.query(`SELECT * FROM "TableDoesNotExist"`)).rejects.toMatchObject({
              message: 'relation "TableDoesNotExist" does not exist',
            });
          })
        ).rejects.toThrow('current transaction is aborted, commands ignored until end of transaction block');

        await expectPatientVisible(txRepo, patient1?.id);
        await expectPatientAbsent(txRepo, patient2?.id, { outcome: notFound });
      });

      await expectPatientSearchCount(repo, patient1?.id, 1);
      await expectPatientSearchCount(repo, patient2?.id, 0);
    }));

  test.each([
    { name: 'commit', shouldRollback: false, expectedCalls: 1 },
    { name: 'rollback', shouldRollback: true, expectedCalls: 0 },
  ])('Post-commit callback on $name', ({ shouldRollback, expectedCalls }) =>
    withTestContext(async () => {
      const callback = jest.fn();
      const promise = repo.withTransaction(async (txRepo) => {
        await txRepo.postCommit(async () => {
          callback();
        });
        expect(callback).not.toHaveBeenCalled();
        if (shouldRollback) {
          throw new Error('Roll it back!');
        }
      });

      if (shouldRollback) {
        await expect(promise).rejects.toThrow('Roll it back!');
      } else {
        await promise;
      }
      expect(callback).toHaveBeenCalledTimes(expectedCalls);
    })
  );

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
      await expectPatientVisible(repo, patient.id);
    }));

  test('Conflicting concurrent writes', () =>
    withTestContext(async () => {
      const existing = await repo.createResource<Patient>({ resourceType: 'Patient' });

      const tx1UpdateFinished = Promise.withResolvers<undefined>();
      const allowTx1Commit = Promise.withResolvers<undefined>();
      const tx2CallbackStarted = Promise.withResolvers<undefined>();

      const events: string[] = [];
      const log = jest.fn().mockImplementation((message: string) => {
        events.push(message);
        // console.log(events);
      });

      setSqlDebug('');
      /*
      1. tx1 begins a REPEATABLE READ transaction and updates the patient row.
      2. tx1 stays open, so it still holds the row/update conflict.
      3. tx2 begins its own REPEATABLE READ transaction while tx1 is still open.
      4. tx2 tries to update the same patient row.
      5. Once tx1 commits, Postgres can’t safely let tx2 continue using the snapshot it started with, because that snapshot predates tx1’s committed update.
      6. Postgres raises serialization failure 40001.
      7. RepositoryConnection.withTransaction() treats 40001 as retryable, rolls back tx2, starts a fresh transaction, reruns tx2 callback and succeeds.
      */

      const tx1 = repo.clone().withTransaction(async (txRepo) => {
        log('tx1 start');
        try {
          await txRepo.updateResource({ ...existing, gender: 'unknown' });
        } catch (err) {
          log('tx1 update error');
          throw err;
        }
        tx1UpdateFinished.resolve(undefined);
        log('tx1 after update');
        await allowTx1Commit.promise;
        log('tx1 committing');
      });

      await tx1UpdateFinished.promise;

      const tx2 = repo.clone().withTransaction(async (txRepo) => {
        log('tx2 start');
        tx2CallbackStarted.resolve(undefined);
        try {
          await txRepo.updateResource({ ...existing, deceasedBoolean: false });
        } catch (err) {
          log('tx2 update error');
          throw err;
        }
        log('tx2 after update');
        log('tx2 committing');
      });

      await tx2CallbackStarted.promise;

      allowTx1Commit.resolve(undefined);
      const results = await Promise.allSettled([tx1, tx2]);
      expect(results.map((r) => r.status)).not.toContain('rejected');
      expect(events).toStrictEqual([
        'tx1 start',
        'tx1 after update',
        'tx2 start',
        'tx1 committing',
        'tx2 update error',
        'tx2 start',
        'tx2 after update',
        'tx2 committing',
      ]);
    }));

  test.each<['first' | 'second']>([['first'], ['second']])(
    'Conflicting concurrent conditional creates with %s winning',
    (winner) =>
      withTestContext(async () => {
        const identifier = randomUUID();
        const criteria = 'Patient?identifier=http://example.com/mrn|' + identifier;
        const resource: Patient = {
          resourceType: 'Patient',
          identifier: [{ system: 'http://example.com/mrn', value: identifier }],
        };

        await expect(repo.searchResources(parseSearchRequest(criteria))).resolves.toHaveLength(0);

        const tx1CreateFinished = Promise.withResolvers<undefined>();
        const tx2CreateFinished = Promise.withResolvers<undefined>();
        const allowTx1Commit = Promise.withResolvers<undefined>();
        const allowTx2Commit = Promise.withResolvers<undefined>();

        const search1 = jest.fn();
        const create1 = jest.fn();
        const search2 = jest.fn();
        const create2 = jest.fn();

        // 1. tx1 begins a SERIALIZABLE transaction, searches for and creates the missing patient.
        // 2. tx1 held open
        // 3. tx2 begins a SERIALIZABLE transaction, searches for and creates the missing patient.
        // 4. tx2 held open

        const tx1 = repo.clone().withTransaction(
          async (txRepo) => {
            search1();
            const existing = await txRepo.searchResources(parseSearchRequest(criteria));
            if (!existing.length) {
              create1();
              await txRepo.createResource(resource);
            }
            tx1CreateFinished.resolve(undefined);
            await allowTx1Commit.promise;
          },
          { serializable: true }
        );

        await tx1CreateFinished.promise;

        const tx2 = repo.clone().withTransaction(
          async (txRepo) => {
            search2();
            const existing = await txRepo.searchResources(parseSearchRequest(criteria));
            if (!existing.length) {
              create2();
              await txRepo.createResource(resource);
            }
            tx2CreateFinished.resolve(undefined);
            await allowTx2Commit.promise;
          },
          { serializable: true }
        );

        await tx2CreateFinished.promise;

        // both tx1 and tx2 are ready to commit. First to commit wins, other must retry

        if (winner === 'first') {
          allowTx1Commit.resolve(undefined);
          await tx1;
          allowTx2Commit.resolve(undefined);
        } else {
          allowTx2Commit.resolve(undefined);
          await tx2;
          allowTx1Commit.resolve(undefined);
        }

        const results = await Promise.allSettled([tx1, tx2]);
        expect(results.map((r) => r.status)).not.toContain('rejected');

        await expect(repo.searchResources(parseSearchRequest(criteria))).resolves.toHaveLength(1);

        expect(search1).toHaveBeenCalledTimes(winner === 'first' ? 1 : 2);
        expect(search2).toHaveBeenCalledTimes(winner === 'second' ? 1 : 2);

        // create only called on first attempt; second attempt finds the existing patient
        expect(create1).toHaveBeenCalledTimes(1);
        expect(create2).toHaveBeenCalledTimes(1);
      })
  );

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
      const tx1 = repo.clone().withTransaction(async (txRepo) => {
        await txRepo.searchResources(parseSearchRequest('Patient?_id=' + existing.id)); // Ensure request hits the DB
        await sleep(500);
        return txRepo.updateResource({ ...existing, gender: 'other' });
      });

      await sleep(200);

      const tx2 = repo.clone().updateResource({ ...existing, deceasedBoolean: false });

      const results = await Promise.allSettled([tx1, tx2]);
      await expect(repo.readResource(existing.resourceType, existing.id)).resolves.toBeDefined();
      expect(results.map((r) => r.status)).not.toContain('rejected');
    }));

  test.each([
    {
      name: 'Retry on conflict',
      createError: () => new OperationOutcomeError(conflict('transaction', PostgresError.SerializationFailure)),
      succeedsOnRetry: true,
      expectedCalls: 2,
      expectedResult: true,
    },
    {
      name: 'Only retry specific transaction conflict',
      createError: () => new OperationOutcomeError(conflict('a different conflict', 'other-error')),
      succeedsOnRetry: true,
      expectedCalls: 1,
      expectedError: 'a different conflict',
    },
    {
      name: 'Do not retry combined transaction conflict and other errors',
      createError: () => {
        const outcome = conflict('transaction conflict', PostgresError.SerializationFailure);
        outcome.issue.push({ code: 'invalid', severity: 'error', details: { text: 'invalid data' } });
        return new OperationOutcomeError(outcome);
      },
      succeedsOnRetry: true,
      expectedCalls: 1,
      expectedError: 'transaction conflict; invalid data',
    },
    {
      name: 'Retry transaction only once before emitting failure',
      createError: () =>
        new OperationOutcomeError(conflict('transaction conflict', PostgresError.SerializationFailure)),
      succeedsOnRetry: false,
      expectedCalls: 2,
      expectedError: 'transaction conflict',
    },
  ])('$name', ({ createError, succeedsOnRetry, expectedCalls, expectedError, expectedResult }) =>
    withTestContext(async () => {
      let shouldReturn = false;
      const txFn = jest.fn(async (): Promise<boolean> => {
        if (succeedsOnRetry && shouldReturn) {
          return true;
        }
        shouldReturn = true;
        throw createError();
      });

      if (expectedError) {
        await expect(repo.withTransaction(txFn)).rejects.toThrow(expectedError);
      } else {
        await expect(repo.withTransaction(txFn)).resolves.toStrictEqual(expectedResult);
      }
      expect(txFn).toHaveBeenCalledTimes(expectedCalls);
    })
  );

  test.each([
    {
      name: 'Retry nested transaction',
      succeedsOnRetry: true,
      catchNestedError: false,
      expectedResult: true,
      expectedTxCalls: 2,
      expectedOuterCalls: 2,
    },
    {
      name: 'Retry nested transaction to failure',
      succeedsOnRetry: false,
      catchNestedError: false,
      expectedError: 'transaction conflict',
      expectedTxCalls: 2,
      expectedOuterCalls: 2,
    },
    {
      name: 'Nested transaction does not retry independently',
      succeedsOnRetry: false,
      catchNestedError: true,
      expectedResult: false,
      expectedTxCalls: 1,
      expectedOuterCalls: 1,
    },
  ])(
    '$name',
    ({ succeedsOnRetry, catchNestedError, expectedError, expectedResult, expectedTxCalls, expectedOuterCalls }) =>
      withTestContext(async () => {
        let shouldReturn = false;
        const txFn = jest.fn(async (): Promise<boolean> => {
          if (succeedsOnRetry && shouldReturn) {
            return true;
          }
          shouldReturn = true;
          throw new OperationOutcomeError(conflict('transaction conflict', PostgresError.SerializationFailure));
        });
        const outerTx = jest.fn(async (txRepo): Promise<boolean> => {
          if (!catchNestedError) {
            return txRepo.withTransaction(txFn);
          }
          try {
            await txRepo.withTransaction(txFn);
            return true;
          } catch (_) {
            return false;
          }
        });

        if (expectedError) {
          await expect(repo.withTransaction(outerTx)).rejects.toThrow(expectedError);
        } else {
          await expect(repo.withTransaction(outerTx)).resolves.toStrictEqual(expectedResult);
        }
        expect(txFn).toHaveBeenCalledTimes(expectedTxCalls);
        expect(outerTx).toHaveBeenCalledTimes(expectedOuterCalls);
      })
  );

  describe('transaction-scoped repository guards', () => {
    test('every public Repository / inherited FhirRepository member is classified', () => {
      const allMembers = collectPublicMembers(repo);

      // Aggregate prototype members keyed by name; the value records which kinds (method,
      // getter, setter) are present so the same Map can answer both "does this exact
      // (name, kind) exist?" and "does this name exist at all?".
      const memberKinds = new Map<PropertyKey, Set<MemberKind>>();
      for (const member of allMembers) {
        let kinds = memberKinds.get(member.name);
        if (!kinds) {
          kinds = new Set();
          memberKinds.set(member.name, kinds);
        }
        kinds.add(member.kind);
      }

      // Every public prototype member must appear in exactly one classification bucket.
      const unclassified: { source: string; key: string; kind: MemberKind }[] = [];
      const guardedKeys = new Set<string>();
      for (const entry of guardedInvocations) {
        guardedKeys.add(memberKey(entry.name, entry.kind));
      }
      for (const member of allMembers) {
        if (guardedKeys.has(memberKey(member.name, member.kind))) {
          continue;
        }
        if (unguardedMembers.has(member.name)) {
          continue;
        }
        if (knownPrivateMembers.has(member.name)) {
          continue;
        }
        unclassified.push({ source: member.source, key: member.name.toString(), kind: member.kind });
      }

      // Each classification entry must reference a real prototype member, so renames or
      // deletions invalidate stale bookkeeping in this file.
      const strayGuarded: string[] = [];
      for (const entry of guardedInvocations) {
        if (!memberKinds.get(entry.name)?.has(entry.kind)) {
          strayGuarded.push(memberKey(entry.name, entry.kind));
        }
      }
      const strayPrivate: string[] = [];
      for (const name of knownPrivateMembers) {
        if (!memberKinds.has(name)) {
          strayPrivate.push(name.toString());
        }
      }
      const strayUnguarded: string[] = [];
      for (const name of unguardedMembers) {
        if (!memberKinds.has(name)) {
          strayUnguarded.push(name.toString());
        }
      }

      expect(unclassified).toEqual([]);
      expect(strayGuarded).toEqual([]);
      expect(strayPrivate).toEqual([]);
      expect(strayUnguarded).toEqual([]);
    });

    describe('guarded methods reject the parent repo inside withTransaction', () => {
      test.each(guardedInvocations.map((entry) => [String(entry.name), entry] as const))('%s', (_label, entry) =>
        withTestContext(async () => {
          let observedError: unknown;
          await repo.withTransaction(async () => {
            try {
              // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
              const result = entry.invoke(repo);
              if (result instanceof Promise) {
                await result;
              }
            } catch (err) {
              observedError = err;
            }
          });
          expect(observedError).toBeInstanceOf(Error);
          expect((observedError as Error).message).toContain('transaction-scoped repository');
        })
      );
    });

    test('closed repository rejects guarded operations', () =>
      withTestContext(async () => {
        const cloned = repo.clone();
        cloned[Symbol.dispose]();

        expect(() => cloned.getDatabaseClient(DatabaseMode.WRITER)).toThrow('Already closed');
        await expect(cloned.createResource<Patient>({ resourceType: 'Patient' })).rejects.toThrow('Already closed');
        await expect(cloned.withTransaction(async () => undefined)).rejects.toThrow('Already closed');
      }));
  });

  test('Retry after create should not execute post-commit hooks from rollback', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });
      const addBackgroundJobsSpy = jest.spyOn(workersModule, 'addBackgroundJobs');
      const patients: WithId<Patient>[] = [];
      let shouldError = true;

      const createdPatient = await repo.withTransaction(async (txRepo) => {
        const patient = await txRepo.createResource<Patient>({ resourceType: 'Patient' });
        patients.push(patient);

        if (shouldError) {
          shouldError = false;
          throw Object.assign(new Error('serialization failure'), { code: PostgresError.SerializationFailure });
        }

        return patient;
      });

      expect(patients).toHaveLength(2);
      expect(createdPatient).toEqual(patients[1]);
      expect(addBackgroundJobsSpy).toHaveBeenCalledTimes(1);
      expect(addBackgroundJobsSpy).toHaveBeenCalledWith(
        {
          resourceType: 'Patient',
          id: createdPatient.id,
          meta: expect.any(Object),
        },
        undefined,
        expect.any(Object)
      );

      await expect(repo.readResource('Patient', patients[0].id)).rejects.toMatchObject(
        new OperationOutcomeError(notFound)
      );

      addBackgroundJobsSpy.mockRestore();
    }));

  test('Patch post-commit stores full resource in cache', async () =>
    withTestContext(async () => {
      const { project, repo, login, membership } = await createTestProject({
        withRepo: true,
        withAccessToken: true,
        withClient: true,
        extendedMode: false,
      });
      const extendedRepo = await getRepoForLogin(
        { login, project, membership, userConfig: {} as UserConfiguration },
        true
      );

      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      expect(patient.meta?.project).toBeUndefined();
      expect(patient.gender).toBeUndefined();

      const updatedPatient = await repo.patchResource<Patient>('Patient', patient.id, [
        { op: 'add', path: '/gender', value: 'unknown' },
      ]);
      expect(updatedPatient.meta?.project).toBeUndefined();
      expect(updatedPatient.gender).toStrictEqual('unknown');

      const cachedPatient = await extendedRepo.readResource<Patient>('Patient', patient.id);
      expect(cachedPatient.meta?.project).toStrictEqual(project.id);
      expect(cachedPatient.gender).toStrictEqual('unknown');
    }));

  test('Retry executes post-commit hook once from outer transaction', async () => {
    const repo = systemRepo;
    const postCommit = jest.fn();
    let shouldError = true;

    await repo.withTransaction(async (txRepo) => {
      await txRepo.postCommit(postCommit);

      await txRepo.withTransaction(async () => {
        if (shouldError) {
          shouldError = false;
          throw Object.assign(new Error('serialization failure'), { code: PostgresError.SerializationFailure });
        }
      });
    });

    expect(postCommit).toHaveBeenCalledTimes(1);
  });

  test('Retry should not execute post-commit hook from rollback', async () => {
    const repo = systemRepo;
    const postCommit = jest.fn();

    await repo.withTransaction(async (txRepo) => {
      try {
        await txRepo.withTransaction(async (nestedRepo) => {
          await nestedRepo.postCommit(postCommit);
          throw Object.assign(new Error('serialization failure'), { code: PostgresError.SerializationFailure });
        });
      } catch {
        // Ignore error
      }
    });

    expect(postCommit).toHaveBeenCalledTimes(0);
  });

  test('withTransaction releases connection when rollback fails on a dead backend', async () => {
    const { repo } = await createTestProject({ withRepo: true });

    const warnSpy = jest.spyOn(getLogger(), 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});
    let querySpy: jest.SpyInstance | undefined;
    let releaseSpy: jest.SpyInstance | undefined;

    await expect(
      repo.withTransaction(async (txRepo) => {
        const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
        querySpy = jest.spyOn(client, 'query').mockImplementation(() => {
          // Simulates a session killed by idle_in_transaction_session_timeout: every query
          // issued on the client — including the ROLLBACK the error handler sends — rejects.
          const terminationErr = Object.assign(new Error('terminating connection due to idle-in-transaction timeout'), {
            code: '57P01',
          });
          throw terminationErr;
        });
        assert('release' in client);
        releaseSpy = jest.spyOn(client, 'release');
        await client.query('SELECT 1');
      })
    ).rejects.toThrow('terminating connection due to idle-in-transaction timeout');

    if (!querySpy) {
      throw new Error('querySpy is undefined');
    }
    if (!releaseSpy) {
      throw new Error('releaseSpy is undefined');
    }

    // Bookkeeping must be fully reset so the repo is safe for future use
    expect((repo as any).connection.transactionDepth).toBe(0);
    expect((repo as any).connection.conn).toBeUndefined();

    // Dead client must be released with a truthy err so pg-pool discards it
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy?.mock.calls[0][0]).toBeDefined();

    // The rollback failure should be logged, not thrown
    expect(warnSpy).toHaveBeenCalledWith(
      'Error rolling back transaction',
      expect.objectContaining({
        err: expect.stringContaining('terminating connection'),
      })
    );

    querySpy.mockRestore();
    releaseSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('withStatementTimeout pins connection and discards it after callback', async () => {
    const { repo } = await createTestProject({ withRepo: true });
    let releaseSpy: jest.SpyInstance | undefined;

    await repo.withStatementTimeout({ timeoutMs: 0 }, async (client) => {
      releaseSpy = jest.spyOn(client, 'release');

      await repo.withTransaction(async (txRepo) => {
        expect(txRepo.getDatabaseClient(DatabaseMode.WRITER)).toBe(client);
      });

      expect(releaseSpy).not.toHaveBeenCalled();
    });

    expect(releaseSpy).toHaveBeenCalledWith(true);
    releaseSpy?.mockRestore();
  });

  test('withStatementTimeout rejects borrowed repository connections', async () => {
    const { repo } = await createTestProject({ withRepo: true });

    await repo.withTransaction(async (txRepo) => {
      await expect(
        txRepo.getSystemRepo().withStatementTimeout({ timeoutMs: 0 }, async () => undefined)
      ).rejects.toThrow('borrowed repository connection');
    });
  });

  test('withStatementTimeout prevents writer operations on a pinned reader connection', async () => {
    const { repo } = await createTestProject({ withRepo: true });
    const errorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});

    try {
      await expect(
        repo.withStatementTimeout({ timeoutMs: 0, mode: DatabaseMode.READER }, async () => {
          // The timeout wrapper pins one physical reader client. A nested transaction
          // must not silently reuse that reader client for writer work.
          await repo.withTransaction(async () => undefined);
        })
      ).rejects.toThrow('reader database connection');
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('borrowed repository connections do not reacquire clients after forced release', async () => {
    const rollbackError = new Error('rollback failed');
    const client = {
      query: jest.fn(async (query: string) => {
        if (query === 'ROLLBACK') {
          throw rollbackError;
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);
    const warnSpy = jest.spyOn(getLogger(), 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});

    try {
      await expect(repo.withTransaction(async () => Promise.reject(new Error('work failed')))).rejects.toThrow(
        'work failed'
      );

      // The repository only borrowed this PoolClient, so it drops its local reference
      // after the fatal rollback path but never releases a client it does not own.
      expect(client.release).not.toHaveBeenCalled();

      await expect(repo.withTransaction(async () => undefined)).rejects.toThrow(
        'Borrowed repository connection is no longer available'
      );
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test('withTransaction does not publish transaction state when BEGIN fails', async () => {
    const beginError = new Error('begin failed');
    const client = {
      query: jest.fn(async () => Promise.reject(beginError)),
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);
    const errorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});

    try {
      await expect(repo.withTransaction(async () => undefined)).rejects.toThrow('begin failed');

      // BEGIN never succeeded, so the in-memory state must not claim an active
      // transaction or hold callback frames for one.
      expect((repo as any).connection.transactionDepth).toBe(0);
      expect((repo as any).connection.callbackStack).toHaveLength(0);
      expect((repo as any).connection.hasConnection()).toBe(false);
      expect(client.release).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('withTransaction rejects nested isolation upgrades', async () => {
    const query = jest.fn(async (_sql: string) => ({ rows: [] }));
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);

    await repo.withTransaction(async (txRepo) => {
      await expect(txRepo.withTransaction(async () => undefined, { serializable: true })).rejects.toThrow(
        'Cannot start SERIALIZABLE transaction inside active REPEATABLE READ transaction'
      );
    });

    expect(query.mock.calls.map(([sql]) => sql)).toStrictEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ', 'COMMIT']);
  });

  test('withTransaction allows nested calls at a weaker isolation level', async () => {
    const query = jest.fn(async (_sql: string) => ({ rows: [] }));
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);

    await repo.withTransaction(
      async (txRepo) => {
        await txRepo.withTransaction(async () => undefined);
      },
      { serializable: true }
    );

    expect(query.mock.calls.map(([sql]) => sql)).toStrictEqual([
      'BEGIN ISOLATION LEVEL SERIALIZABLE',
      'SAVEPOINT sp2',
      'RELEASE SAVEPOINT sp2',
      'COMMIT',
    ]);
  });

  test.each([
    { name: 'transaction-scoped repo', getPinnedRepo: (txRepo: Repository) => txRepo },
    { name: 'getSystemRepo', getPinnedRepo: (txRepo: Repository) => txRepo.getSystemRepo() },
    {
      name: 'withOverrideConfig',
      getPinnedRepo: (txRepo: Repository) => txRepo.withOverrideConfig({ extendedMode: false }),
    },
  ])('$name propagates the transaction-scoped client pin', async ({ getPinnedRepo }) => {
    const { repo } = await createTestProject({ withRepo: true });

    let escapedRepo: Repository | undefined;
    await repo.withTransaction(async (txRepo) => {
      const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
      const pinnedRepo = getPinnedRepo(txRepo);

      expect(client).toBeDefined();
      expect('release' in client).toBe(true);
      expect(pinnedRepo.getDatabaseClient(DatabaseMode.WRITER)).toBe(client);
      escapedRepo = pinnedRepo;
    });

    // After the transaction commits the sticky client is released back to the pool, so the
    // captured transaction-scoped repo must refuse to hand out a different client.
    expect(() => (escapedRepo as Repository).getDatabaseClient(DatabaseMode.WRITER)).toThrow(
      'no longer pinned to initial PoolClient'
    );
  });

  test('createTransactionScopedRepo rejects a writer client that is not a PoolClient', async () => {
    // Borrow a connection whose writer client is Pool-like: it answers queries but has no
    // release(), so it does not satisfy isPoolClient and cannot be safely pinned.
    const query = jest.fn(async (_sql: string) => ({ rows: [] }));
    const poolLikeClient = { query } as unknown as PoolClient;
    const repo = createBorrowedRepo(poolLikeClient);
    const errorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});

    try {
      await expect(repo.withTransaction(async () => undefined)).rejects.toThrow('not pinned to a PoolClient');
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('withTransactionStateLock serializes concurrent transaction begins', async () => {
    const savepointIssued = Promise.withResolvers<undefined>();
    const allowSavepoint = Promise.withResolvers<undefined>();
    const finishFirstNestedTransaction = Promise.withResolvers<undefined>();
    const secondCallbackStarted = Promise.withResolvers<undefined>();
    const queries: string[] = [];
    let savepointCount = 0;
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql === 'SAVEPOINT sp2' && ++savepointCount === 1) {
        // Pause the first nested begin before beginTransaction can publish transactionDepth = 2.
        savepointIssued.resolve(undefined);
        await allowSavepoint.promise;
      }
      return { rows: [] };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);

    await repo.withTransaction(async (txRepo) => {
      const txRepo2 = txRepo.getSystemRepo();
      const tx1 = txRepo.withTransaction(async () => {
        await finishFirstNestedTransaction.promise;
      });
      await savepointIssued.promise;

      // Start a second transaction from another facade sharing the same connection while the first
      // nested transaction is suspended in SAVEPOINT. Without the state lock, this second call can
      // observe transactionDepth = 1 and incorrectly issue another SAVEPOINT sp2.
      const tx2 = txRepo2.withTransaction(async () => {
        secondCallbackStarted.resolve(undefined);
      });
      // Let the second transaction run any queued promise continuations. If it is not blocked by the
      // lock, it will append its own SQL before this assertion.
      await allowPendingMicrotasks();

      // The second begin must wait until the first SAVEPOINT has completed and published transactionDepth.
      expect(queries).toStrictEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ', 'SAVEPOINT sp2']);

      allowSavepoint.resolve(undefined);
      await secondCallbackStarted.promise;
      finishFirstNestedTransaction.resolve(undefined);
      await Promise.all([tx1, tx2]);
    });

    expect(queries).toStrictEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ',
      'SAVEPOINT sp2',
      'SAVEPOINT sp3',
      'RELEASE SAVEPOINT sp3',
      'RELEASE SAVEPOINT sp2',
      'COMMIT',
    ]);
  });

  test('withTransactionStateLock serializes concurrent transaction commits', async () => {
    const firstStarted = Promise.withResolvers<undefined>();
    const secondStarted = Promise.withResolvers<undefined>();
    const finishTransactions = Promise.withResolvers<undefined>();
    const releaseSavepointIssued = Promise.withResolvers<undefined>();
    const allowReleaseSavepoint = Promise.withResolvers<undefined>();
    const queries: string[] = [];
    let releaseSavepointCount = 0;
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql === 'RELEASE SAVEPOINT sp3' && ++releaseSavepointCount === 1) {
        // Hold the inner commit in the database call before transactionDepth is decremented.
        releaseSavepointIssued.resolve(undefined);
        await allowReleaseSavepoint.promise;
      }
      return { rows: [] };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);

    await repo.withTransaction(async (txRepo) => {
      const txRepo2 = txRepo.getSystemRepo();
      const tx1 = txRepo.withTransaction(async () => {
        firstStarted.resolve(undefined);
        await secondStarted.promise;
        await finishTransactions.promise;
      });
      await firstStarted.promise;

      const tx2 = txRepo2.withTransaction(async () => {
        secondStarted.resolve(undefined);
        await finishTransactions.promise;
      });
      await secondStarted.promise;

      expect(queries).toStrictEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ', 'SAVEPOINT sp2', 'SAVEPOINT sp3']);
      finishTransactions.resolve(undefined);
      await releaseSavepointIssued.promise;
      // Both scoped transaction callbacks have finished. Yield so the second commit path can attempt to
      // run; it must not issue another RELEASE SAVEPOINT until the first one decrements transactionDepth.
      await allowPendingMicrotasks();

      // The other commit path must wait until transactionDepth is decremented after RELEASE SAVEPOINT.
      expect(queries).toStrictEqual([
        'BEGIN ISOLATION LEVEL REPEATABLE READ',
        'SAVEPOINT sp2',
        'SAVEPOINT sp3',
        'RELEASE SAVEPOINT sp3',
      ]);

      allowReleaseSavepoint.resolve(undefined);
      await Promise.all([tx1, tx2]);
    });

    expect(queries).toStrictEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ',
      'SAVEPOINT sp2',
      'SAVEPOINT sp3',
      'RELEASE SAVEPOINT sp3',
      'RELEASE SAVEPOINT sp2',
      'COMMIT',
    ]);
  });

  test('withTransactionStateLock serializes concurrent transaction rollbacks', async () => {
    const firstStarted = Promise.withResolvers<undefined>();
    const secondStarted = Promise.withResolvers<undefined>();
    const failTransactions = Promise.withResolvers<undefined>();
    const rollbackSavepointIssued = Promise.withResolvers<undefined>();
    const allowRollbackSavepoint = Promise.withResolvers<undefined>();
    const queries: string[] = [];
    let rollbackSavepointCount = 0;
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql === 'ROLLBACK TO SAVEPOINT sp3' && ++rollbackSavepointCount === 1) {
        // Hold the inner rollback in the database call before transactionDepth is decremented.
        rollbackSavepointIssued.resolve(undefined);
        await allowRollbackSavepoint.promise;
      }
      return { rows: [] };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);
    const errorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});

    try {
      await repo.withTransaction(async (txRepo) => {
        const txRepo2 = txRepo.getSystemRepo();
        const tx1 = txRepo
          .withTransaction(async () => {
            firstStarted.resolve(undefined);
            await secondStarted.promise;
            await failTransactions.promise;
            throw new Error('first rollback');
          })
          .catch((err) => err);
        await firstStarted.promise;

        const tx2 = txRepo2
          .withTransaction(async () => {
            secondStarted.resolve(undefined);
            await failTransactions.promise;
            throw new Error('second rollback');
          })
          .catch((err) => err);
        await secondStarted.promise;

        expect(queries).toStrictEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ', 'SAVEPOINT sp2', 'SAVEPOINT sp3']);
        failTransactions.resolve(undefined);
        await rollbackSavepointIssued.promise;
        // Both scoped transaction callbacks have failed. Yield so the second rollback path can attempt
        // to run; it must not issue another ROLLBACK until the first one updates transactionDepth.
        await allowPendingMicrotasks();

        // The other rollback path must wait until transactionDepth is decremented after ROLLBACK TO SAVEPOINT.
        expect(queries).toStrictEqual([
          'BEGIN ISOLATION LEVEL REPEATABLE READ',
          'SAVEPOINT sp2',
          'SAVEPOINT sp3',
          'ROLLBACK TO SAVEPOINT sp3',
        ]);

        allowRollbackSavepoint.resolve(undefined);
        const results = await Promise.all([tx1, tx2]);

        expect(results).toEqual([expect.any(Error), expect.any(Error)]);
      });
      expect(queries).toStrictEqual([
        'BEGIN ISOLATION LEVEL REPEATABLE READ',
        'SAVEPOINT sp2',
        'SAVEPOINT sp3',
        'ROLLBACK TO SAVEPOINT sp3',
        'ROLLBACK TO SAVEPOINT sp2',
        'COMMIT',
      ]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('processing pre-commit callbacks does not deadlock a transaction', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      return { rows: [] };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);

    const result = await Promise.race([
      repo
        .withTransaction(async (txRepo) => {
          await txRepo.preCommit(async (commitRepo) => {
            // Pre-commit callbacks are allowed to start their own nested transaction.
            // If the outer commit held transactionStateLock while running callbacks, this nested
            // transaction would wait for the lock while the outer commit waited for the callback.
            await commitRepo.withTransaction(async () => undefined);
          });
        })
        .then(() => 'completed'),
      new Promise((resolve) => {
        // The broken implementation deadlocks, so the race gives the test a bounded failure mode.
        setTimeout(() => resolve('timed out'), 100);
      }),
    ]);

    expect(result).toBe('completed');
    expect(queries).toStrictEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ',
      'SAVEPOINT sp2',
      'RELEASE SAVEPOINT sp2',
      'COMMIT',
    ]);
  });

  test('parent repository cannot start a transaction during scoped pre-commit', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      return { rows: [] };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = createBorrowedRepo(client);
    let parentTransactionError: unknown;
    let parentDatabaseClientError: unknown;

    await repo.withTransaction(async (txRepo) => {
      await txRepo.preCommit(async () => {
        try {
          // The parent repo should also be blocked for ordinary repository/database operations, not
          // only for nested withTransaction calls.
          // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
          repo.getDatabaseClient(DatabaseMode.WRITER);
        } catch (err) {
          parentDatabaseClientError = err;
        }

        try {
          // A pre-commit callback runs before the outer COMMIT. Starting a transaction through the
          // original repo here used to create SAVEPOINT sp2 and convert the outer commit into a
          // savepoint release. Only the transaction-scoped repo is allowed to nest in this window.
          // eslint-disable-next-line medplum/no-transaction-callback-invoking-repo -- Verifies parent repo rejection.
          await repo.withTransaction(async () => undefined);
        } catch (err) {
          parentTransactionError = err;
        }
      });
    });

    expect(parentTransactionError).toEqual(expect.any(Error));
    expect((parentTransactionError as Error).message).toContain('transaction-scoped repository');
    expect(parentDatabaseClientError).toEqual(expect.any(Error));
    expect((parentDatabaseClientError as Error).message).toContain('transaction-scoped repository');
    expect(queries).toStrictEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ', 'COMMIT']);
  });

  test.each(['commit', 'rollback'])('Post-commit handling on %s', async (mode) => {
    const repo = systemRepo;
    const loggerErrorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});
    const finalPostCommit = jest.fn();

    const error = new Error('Post-commit hook failed');
    const promise = repo.withTransaction(async (txRepo) => {
      await txRepo.postCommit(async () => {
        throw new Error('Post-commit hook failed');
      });
      await txRepo.postCommit(async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'Post-commit hook failed with string';
      });
      await txRepo.postCommit(finalPostCommit);
      if (mode === 'rollback') {
        throw new Error('Transaction failed');
      }
    });

    if (mode === 'commit') {
      await promise;
      expect(finalPostCommit).toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.any(String), error);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          err: 'Post-commit hook failed with string',
        })
      );
    } else {
      await expect(promise).rejects.toThrow('Transaction failed');
      expect(finalPostCommit).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: 'Transaction failed',
        })
      );
    }

    loggerErrorSpy.mockRestore();
  });

  test('clone does not share the same connection as the original repository', async () =>
    withTestContext(async () => {
      // const { repo } = await createTestProject({ withRepo: true });

      let checked = false;
      await repo.withTransaction(async (txRepo) => {
        const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
        // starting a transaction will have pinned a connection to `txRepo`.
        // so ensure that cloning after that pinning does not propagate the pinned connection
        // to the cloned repository.
        const clonedRepo1 = txRepo.clone();
        expect(clonedRepo1.getDatabaseClient(DatabaseMode.WRITER)).not.toBe(client);
        checked = true;
      });
      expect(checked).toBe(true);
    }));
});

function memberKey(name: PropertyKey, kind: MemberKind): string {
  return `${kind}:${name.toString()}`;
}

interface DiscoveredMember {
  name: PropertyKey;
  kind: MemberKind;
  source: string;
}

/**
 * Walks the prototype chain from the given instance toward Object.prototype, collecting
 * every public method, getter, and setter. A member defined on a more-derived prototype
 * shadows one with the same name on a parent prototype.
 * @param instance - The instance whose prototype chain should be enumerated.
 * @returns The set of public members reachable from the instance.
 */
function collectPublicMembers(instance: object): DiscoveredMember[] {
  const result: DiscoveredMember[] = [];
  const seen = new Set<PropertyKey>();
  let prototype = Object.getPrototypeOf(instance);
  while (prototype && prototype !== Object.prototype) {
    const source = (prototype.constructor as { name: string }).name;
    const additionsThisLevel: PropertyKey[] = [];
    for (const key of Reflect.ownKeys(prototype)) {
      if (seen.has(key)) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (!descriptor) {
        throw new Error(`Missing descriptor for ${key.toString()}`);
      }
      if (typeof descriptor.value === 'function') {
        result.push({ name: key, kind: 'method', source });
      }
      if (typeof descriptor.get === 'function') {
        result.push({ name: key, kind: 'getter', source });
      }
      if (typeof descriptor.set === 'function') {
        result.push({ name: key, kind: 'setter', source });
      }
      additionsThisLevel.push(key);
    }
    // Defer marking names as seen until the level is fully processed so that getter and
    // setter declared on the same prototype both make it into the result.
    for (const key of additionsThisLevel) {
      seen.add(key);
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return result;
}

async function expectPatientVisible(repo: Repository, id: string | undefined): Promise<void> {
  assert(id);
  await expect(repo.readResource('Patient', id)).resolves.toBeDefined();
  await expectPatientSearchCount(repo, id, 1);
}

async function expectPatientAbsent(
  repo: Repository,
  id: string | undefined,
  expectedReadError: string | object = 'Not found'
): Promise<void> {
  assert(id);
  const expectation = expect(repo.readResource('Patient', id)).rejects;
  if (typeof expectedReadError === 'string') {
    await expectation.toThrow(expectedReadError);
  } else {
    await expectation.toMatchObject(expectedReadError);
  }
  await expectPatientSearchCount(repo, id, 0);
}

async function expectPatientSearchCount(repo: Repository, id: string | undefined, count: number): Promise<void> {
  assert(id);
  const result = await repo.search<Patient>({
    resourceType: 'Patient',
    filters: [{ code: '_id', operator: Operator.EQUALS, value: id }],
  });
  expect(result).toBeDefined();
  expect(result.entry).toHaveLength(count);
}

function createBorrowedRepo(client: PoolClient): Repository {
  return getShardSystemRepo('test-shard', RepositoryConnection.borrowClient(client, { mode: DatabaseMode.WRITER }));
}

// Some transaction race tests need to make a negative assertion: a competing async path has had a
// chance to resume, but it must not issue SQL while the transaction state lock is held.
async function allowPendingMicrotasks(): Promise<void> {
  // Yield twice so already-queued promise continuations, and continuations queued by those
  // continuations, can run far enough to issue SQL if the lock is missing.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
