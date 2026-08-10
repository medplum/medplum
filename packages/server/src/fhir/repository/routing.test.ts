// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Operator } from '@medplum/core';
import type { Patient, ResourceType } from '@medplum/fhirtypes';
import assert from 'node:assert';
import type { MockInstance } from 'vitest';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';
import { createTestProject, spyOnQuery, withTestContext } from '../../test.setup';
import type { Repository } from '../repo';
import { getShardSystemRepo } from '../repo';
import { GLOBAL_SHARD_ID } from '../sharding';
import { repoAccess } from './access-tracker';
import type { RepositoryConnections } from './repository-connections';

/**
 * A shard other than the global one. No database is configured for it yet, so every connection
 * still dials the test database; these tests assert which connection an operation is routed to and
 * which combinations are refused, not that the data is actually held apart.
 */
const projectShardId = 'shard-b';

/**
 * The shards a repository has opened connections for.
 * @param repo - The repository to inspect.
 * @returns The shard IDs.
 */
function shardsOf(repo: Repository): string[] {
  return [...((repo as any).connections as RepositoryConnections).entries()].map((e) => e.connection.shardId);
}

/**
 * The shards whose connections currently have an open transaction.
 * @param repo - The repository to inspect.
 * @returns The shard IDs with an open transaction.
 */
function transactingShardsOf(repo: Repository): string[] {
  return [...((repo as any).connections as RepositoryConnections).entries()]
    .filter((entry) => entry.connection.isInTransaction())
    .map((entry) => entry.connection.shardId);
}

/**
 * Searches a single resource by ID, which always reaches the database rather than the cache.
 * @param repo - The repository to search through.
 * @param resourceType - The resource type to search.
 * @param id - The resource ID to match.
 * @returns The IDs of the matching resources.
 */
async function searchIds(repo: Repository, resourceType: ResourceType, id: string): Promise<(string | undefined)[]> {
  const results = await repo.searchResources({
    resourceType,
    filters: [{ code: '_id', operator: Operator.EQUALS, value: id }],
  });
  return results.map((resource) => resource.id);
}

/**
 * The message `resolveShardId` throws when one operation's resource types resolve to two shards.
 * @param source - The call-site label the operation supplied, or undefined when it supplied none.
 * @returns The expected error message.
 */
function spanningShardsMessage(source?: string): string {
  return `Operation cannot span shards (${GLOBAL_SHARD_ID}: Project, ${projectShardId}: Patient, source: ${source ?? 'unknown'})`;
}

/**
 * The message `Repository.assertShardReachable` throws when an operation resolves to a shard other
 * than the one this repository's own transaction is bound to.
 * @param requested - The shard the operation resolved to.
 * @param active - The shard this repository's transaction is open on.
 * @param source - (optional) The call-site label, appended to the diagnostics when the operation
 * supplied one.
 * @returns The expected error message.
 */
function crossShardMessage(requested: string, active: string, source?: string): string {
  const sourceSuffix = source ? `, source: ${source}` : '';
  return `Cannot use shard while a transaction is active on a different shard (Requested ${requested}, active txn on ${active}${sourceSuffix})`;
}

/**
 * The statements a query spy observed. The spy must be installed inside the transaction callback,
 * on the client the transaction is pinned to, so that it is in place before COMMIT is issued.
 * @param querySpy - Spy on the query method of that client.
 * @returns The SQL text of every statement the spy saw.
 */
function statementsFrom(querySpy: MockInstance | undefined): string[] {
  assert(querySpy, 'query spy was never installed');
  return querySpy.mock.calls.map((call) => call[0]);
}

/**
 * Asserts that the transaction observed by a query spy committed.
 *
 * Refusing a statement that belongs to another shard must leave the transaction it was refused from
 * healthy: the caller may catch the error and carry on, so the work already done has to be
 * committable.
 * @param querySpy - Spy on the query method of the client the transaction is pinned to.
 */
function expectCommitted(querySpy: MockInstance | undefined): void {
  const statements = statementsFrom(querySpy);
  expect(statements).toContain('COMMIT');
  expect(statements).not.toContain('ROLLBACK');
}

/**
 * Asserts that the transaction observed by a query spy rolled back.
 * @param querySpy - Spy on the query method of the client the transaction is pinned to.
 */
function expectRolledBack(querySpy: MockInstance | undefined): void {
  const statements = statementsFrom(querySpy);
  expect(statements).toContain('ROLLBACK');
  expect(statements).not.toContain('COMMIT');
}

describe('Repository shard routing', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Routes global and project-scoped types to separate connections', () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      repo.getDatabaseClient(repoAccess.sqlRead('Patient'));
      expect(shardsOf(repo)).toStrictEqual([projectShardId]);

      repo.getDatabaseClient(repoAccess.sqlRead('Project'));
      expect(shardsOf(repo)).toStrictEqual([projectShardId, GLOBAL_SHARD_ID]);

      // Reaching the same shards again reuses the connections rather than adding more.
      repo.getDatabaseClient(repoAccess.sqlWrite('Observation'));
      repo.getDatabaseClient(repoAccess.sqlWrite('ProjectMembership'));
      expect(shardsOf(repo)).toStrictEqual([projectShardId, GLOBAL_SHARD_ID]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Rejects a statement that spans shards', () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      expect(() => repo.getDatabaseClient(repoAccess.sqlRead(['Patient', 'Project']))).toThrow(spanningShardsMessage());
      // Nothing was reached, so no connection was opened for either half.
      expect(shardsOf(repo)).toStrictEqual([]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Allows a statement mixing types when the project is on the global shard', () => {
    // The production configuration: every project shares the global shard, so a statement naming
    // both kinds of type still resolves to one database.
    const repo = getShardSystemRepo(GLOBAL_SHARD_ID);
    try {
      expect(() =>
        repo.getDatabaseClient(repoAccess.sqlRead(['Patient', 'Project'], { source: 'test.globalShardRepo' }))
      ).not.toThrow();
      expect(shardsOf(repo)).toStrictEqual([GLOBAL_SHARD_ID]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Rejects a transaction that spans shards before issuing BEGIN', async () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      await expect(
        repo.withTransaction(async () => undefined, {
          resourceTypes: ['Patient', 'Project'],
          source: 'test.spanningTransaction',
        })
      ).rejects.toThrow(spanningShardsMessage('test.spanningTransaction'));

      expect(shardsOf(repo)).toStrictEqual([]);
      expect(transactingShardsOf(repo)).toStrictEqual([]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Rejects reaching the global shard from a transaction on the project shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    let querySpy: MockInstance | undefined;
    try {
      await repo.withTransaction(
        async (txRepo) => {
          // The transaction's own shard stays available; this line would throw if it were not.
          const client = txRepo.getDatabaseClient(repoAccess.sqlWrite('Patient'));
          querySpy = spyOnQuery(client);

          expect(() => txRepo.getDatabaseClient(repoAccess.sqlRead('Project'))).toThrow(
            crossShardMessage(GLOBAL_SHARD_ID, projectShardId)
          );
        },
        { resourceTypes: 'Patient', source: 'test.projectShardTransaction' }
      );

      expectCommitted(querySpy);
      expect(transactingShardsOf(repo)).toStrictEqual([]);
    } finally {
      querySpy?.mockRestore();
      repo[Symbol.dispose]();
    }
  });

  test('Rejects reaching the project shard from a transaction on the global shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    let querySpy: MockInstance | undefined;
    try {
      await repo.withTransaction(
        async (txRepo) => {
          const client = txRepo.getDatabaseClient(repoAccess.sqlWrite('Project'));
          querySpy = spyOnQuery(client);

          expect(() => txRepo.getDatabaseClient(repoAccess.sqlRead('Patient'))).toThrow(
            crossShardMessage(projectShardId, GLOBAL_SHARD_ID)
          );
        },
        { resourceTypes: 'Project', source: 'test.globalShardTransaction' }
      );

      expectCommitted(querySpy);
      expect(transactingShardsOf(repo)).toStrictEqual([]);
    } finally {
      querySpy?.mockRestore();
      repo[Symbol.dispose]();
    }
  });

  test('Is unaffected by a transaction open on another shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      await repo.withTransaction(
        async (txRepo) => {
          const connections = (txRepo as any).connections as RepositoryConnections;
          const globalEntry = connections.entryFor(GLOBAL_SHARD_ID);

          // A second, concurrently running transaction opens on the global shard
          await globalEntry.connection.withTransaction(
            globalEntry.rootScope,
            async () => {
              // other txn is bound to the project shard and behaves as usual
              expect(() => txRepo.getDatabaseClient(repoAccess.sqlWrite('Patient'))).not.toThrow();

              // but it cannot access other shards while the transaction is bound to the project shard
              expect(() => txRepo.getDatabaseClient(repoAccess.sqlRead('Project'))).toThrow(
                crossShardMessage(GLOBAL_SHARD_ID, projectShardId)
              );
            },
            { resourceTypes: 'Project', source: 'test.foreignTransaction' }
          );
        },
        { resourceTypes: 'Patient', source: 'test.concurrentTransactions' }
      );
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Rejects joining an open transaction with work from another shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      await repo.withTransaction(
        async (txRepo) => {
          // Same shard: joins the transaction in progress.
          await expect(
            txRepo.ensureInTransaction(async () => 'joined', {
              resourceTypes: 'Observation',
              source: 'test.ensureSameShard',
            })
          ).resolves.toStrictEqual('joined');

          // Other shard: refused rather than silently enrolled in a transaction that cannot cover it.
          await expect(
            txRepo.ensureInTransaction(async () => undefined, {
              resourceTypes: 'Project',
              source: 'test.ensureOtherShard',
            })
          ).rejects.toThrow(crossShardMessage(GLOBAL_SHARD_ID, projectShardId, 'test.ensureOtherShard'));
        },
        { resourceTypes: 'Patient', source: 'test.ensureInTransaction' }
      );
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Defers a pre-commit callback and runs it on the transaction shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    let ranOnShard: string | undefined;
    let querySpy: MockInstance | undefined;
    try {
      await repo.withTransaction(
        async (txRepo) => {
          const client = txRepo.getDatabaseClient(repoAccess.sqlWrite('Patient'));
          querySpy = spyOnQuery(client);

          await txRepo.preCommit(async () => {
            // Pre-commit runs before COMMIT, so it is still inside the transaction and confined to
            // the shard the transaction is bound to.
            txRepo.getDatabaseClient(repoAccess.sqlWrite('Observation'));
            ranOnShard = projectShardId;
          });

          expect(ranOnShard).toBeUndefined(); // deferred, not invoked at registration time
        },
        { resourceTypes: 'Patient', source: 'test.preCommitSameShard' }
      );

      expect(ranOnShard).toStrictEqual(projectShardId);
      expectCommitted(querySpy);
    } finally {
      querySpy?.mockRestore();
      repo[Symbol.dispose]();
    }
  });

  test('Rolls back when a pre-commit callback touches another shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    let querySpy: MockInstance | undefined;
    try {
      await expect(
        repo.withTransaction(
          async (txRepo) => {
            const client = txRepo.getDatabaseClient(repoAccess.sqlWrite('Patient'));
            querySpy = spyOnQuery(client);

            await txRepo.preCommit(async () => {
              txRepo.getDatabaseClient(repoAccess.sqlRead('Project'));
            });
          },
          { resourceTypes: 'Patient', source: 'test.preCommitOtherShard' }
        )
      ).rejects.toThrow(crossShardMessage(GLOBAL_SHARD_ID, projectShardId));

      // The transaction is still open when pre-commit callbacks run, so the refusal takes it down
      // rather than being absorbed.
      expectRolledBack(querySpy);
      expect(transactingShardsOf(repo)).toStrictEqual([]);
    } finally {
      querySpy?.mockRestore();
      repo[Symbol.dispose]();
    }
  });

  test('Runs a pre-commit callback immediately outside a transaction, on either shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    let ran = false;
    try {
      await repo.preCommit(async () => {
        // There is no transaction to defer until, so the callback runs now — and with nothing bound,
        // both shards are reachable.
        repo.getDatabaseClient(repoAccess.sqlWrite('Patient'));
        repo.getDatabaseClient(repoAccess.sqlRead('Project'));
        ran = true;
      });

      expect(ran).toBe(true);
      expect(shardsOf(repo).toSorted()).toStrictEqual([GLOBAL_SHARD_ID, projectShardId]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Runs a post-commit callback after the transaction unbinds, on either shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    let reachedOtherShard = false;
    let transactingDuringCallback: string[] | undefined;
    let callbackError: unknown;
    let querySpy: MockInstance | undefined;
    try {
      await repo.withTransaction(
        async (txRepo) => {
          const client = txRepo.getDatabaseClient(repoAccess.sqlWrite('Patient'));
          querySpy = spyOnQuery(client);

          await txRepo.postCommit(async () => {
            // The connection set is shared by reference, so this is the same set `repo` holds.
            transactingDuringCallback = transactingShardsOf(txRepo);
            try {
              // COMMIT has already run, so no shard is bound and the global shard is reachable even
              // though the transaction ran on the project shard.
              txRepo.getDatabaseClient(repoAccess.sqlRead('Project'));
              reachedOtherShard = true;
            } catch (err) {
              // Post-commit errors are swallowed and logged, so capture rather than throw.
              callbackError = err;
            }
          });

          expect(reachedOtherShard).toBe(false); // deferred until after COMMIT
        },
        { resourceTypes: 'Patient', source: 'test.postCommitOtherShard' }
      );

      expect(callbackError).toBeUndefined();
      expect(transactingDuringCallback).toStrictEqual([]);
      expect(reachedOtherShard).toBe(true);
      expectCommitted(querySpy);
      expect(shardsOf(repo).toSorted()).toStrictEqual([GLOBAL_SHARD_ID, projectShardId]);
    } finally {
      querySpy?.mockRestore();
      repo[Symbol.dispose]();
    }
  });

  test('Runs a post-commit callback immediately outside a transaction, on either shard', async () => {
    const repo = getShardSystemRepo(projectShardId);
    let ran = false;
    let callbackError: unknown;
    try {
      await repo.postCommit(async () => {
        try {
          repo.getDatabaseClient(repoAccess.sqlWrite('Patient'));
          repo.getDatabaseClient(repoAccess.sqlRead('Project'));
          ran = true;
        } catch (err) {
          callbackError = err;
        }
      });

      expect(callbackError).toBeUndefined();
      expect(ran).toBe(true);
      expect(shardsOf(repo).toSorted()).toStrictEqual([GLOBAL_SHARD_ID, projectShardId]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Routes a configuration statement to the shard of the types it configures', () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      // Naming a project-scoped type puts the statement on this repository's shard, which is where
      // the queries it configures will run.
      repo.getDatabaseClient(repoAccess.sqlReadConfig('Patient', { source: 'test.projectConfig' }));
      expect(shardsOf(repo)).toStrictEqual([projectShardId]);

      // Naming a global type follows it to the global shard instead.
      repo.getDatabaseClient(repoAccess.sqlReadConfig('Project', { source: 'test.globalConfig' }));
      expect(shardsOf(repo)).toStrictEqual([projectShardId, GLOBAL_SHARD_ID]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Rejects an access that names no resource types', () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      expect(() =>
        repo.getDatabaseClient({
          mode: DatabaseMode.READER,
          operation: 'configuration',
          resourceTypes: [],
          source: 'test.unroutable',
        })
      ).toThrow('Cannot route an operation that specifies no resource types');
      expect(shardsOf(repo)).toStrictEqual([]);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Does not record a configuration statement as resource access', () => {
    const infoSpy = vi.spyOn(getLogger(), 'info').mockImplementation(() => {});
    const repo = getShardSystemRepo(GLOBAL_SHARD_ID);
    try {
      repo.getDatabaseClient(repoAccess.sqlReadConfig(['Patient', 'Project'], { source: 'test.mixedConfig' }));

      // A configuration statement reads and writes nothing, so it must stay out of the access
      // inventory even though the types it routes by fall on both sides of the boundary. The tracker
      // is the only thing that records mixed access, so nothing at all should be logged.
      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
      repo[Symbol.dispose]();
    }
  });

  test('Shares one connection set with repositories derived from it', async () => {
    const repo = getShardSystemRepo(projectShardId);
    try {
      await repo.withTransaction(
        async (txRepo) => {
          const derived = txRepo.withOverrideConfig({ extendedMode: true });

          expect((derived as any).connections).toBe((txRepo as any).connections);
          // The derived repository inherits the transaction binding along with the set, so it is
          // refused the other shard for the same reason its parent is.
          expect(() => derived.getDatabaseClient(repoAccess.sqlRead('Project'))).toThrow(
            crossShardMessage(GLOBAL_SHARD_ID, projectShardId)
          );
        },
        { resourceTypes: 'Patient', source: 'test.sharedConnections' }
      );
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Reaches both shards in sequence outside a transaction', () =>
    withTestContext(async () => {
      const { project, repo: projectRepo } = await createTestProject({ withRepo: true });
      const patient = await projectRepo.createResource<Patient>({ resourceType: 'Patient' });

      const repo = getShardSystemRepo(projectShardId);
      try {
        // Searches, not reads: a read of a just-written resource is served from the resource cache
        // and never reaches a database, so it would route nowhere. A sequence of single-shard
        // operations is legal even though one transaction covering both would not be.
        await expect(searchIds(repo, 'Project', project.id)).resolves.toStrictEqual([project.id]);
        await expect(searchIds(repo, 'Patient', patient.id)).resolves.toStrictEqual([patient.id]);

        expect(shardsOf(repo).toSorted()).toStrictEqual([GLOBAL_SHARD_ID, projectShardId]);
      } finally {
        repo[Symbol.dispose]();
      }
    }));
});
