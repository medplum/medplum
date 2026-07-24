// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import assert from 'node:assert';
import type { PoolClient } from 'pg';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode } from '../../database';
import { withTestContext } from '../../test.setup';
import type { Repository } from '../repo';
import { getShardSystemRepo } from '../repo';
import { GLOBAL_SHARD_ID, ShardRoutingError } from '../sharding';
import { RepositoryConnection } from './repository-connection';

/**
 * Reaches into a Repository's private connection map for assertions.
 * @param repo - The repository to inspect.
 * @returns The sorted shard IDs the repository currently holds connections for.
 */
function connectionShardIds(repo: Repository): string[] {
  const connections: Map<string, unknown> = (repo as any).connections;
  return [...connections.keys()].sort();
}

function connectionEntry(repo: Repository, shardId: string): { connection: RepositoryConnection; owned: boolean } {
  return (repo as any).connections.get(shardId);
}

describe('Repository shard routing', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Routes global and project-scoped reads to distinct connections', () =>
    withTestContext(async () => {
      const repo = getShardSystemRepo('test-shard-a');
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });

      // Project-scoped read routes to the project shard.
      await repo.readResource('Patient', patient.id);
      // Global-shard read routes to the global shard.
      await repo.searchResources({ resourceType: 'User', count: 1 });

      expect(connectionShardIds(repo)).toStrictEqual([GLOBAL_SHARD_ID, 'test-shard-a'].sort());
      expect(connectionEntry(repo, 'test-shard-a').connection.shardId).toBe('test-shard-a');
      expect(connectionEntry(repo, GLOBAL_SHARD_ID).connection.shardId).toBe(GLOBAL_SHARD_ID);
    }));

  test('withTransaction binds to the context shard when resource types are empty', () =>
    withTestContext(async () => {
      const repo = getShardSystemRepo('test-shard-a');
      await repo.withTransaction(
        async (txRepo) => {
          expect((txRepo as any).boundShardId).toBe('test-shard-a');
          // A project-scoped statement on the bound shard is fine.
          await txRepo.createResource<Patient>({ resourceType: 'Patient' });
          // A global-shard statement violates the binding.
          await expect(txRepo.readResource('User', txRepo.generateId())).rejects.toThrow(ShardRoutingError);
        },
        { resourceTypes: [], source: 'shard-routing.test.emptyBinding' }
      );
    }));

  test('Same-shard nested transaction runs as a savepoint', () =>
    withTestContext(async () => {
      const repo = getShardSystemRepo('test-shard-a');
      const created = await repo.withTransaction(
        async (txRepo) => {
          return txRepo.withTransaction(async (nested) => nested.createResource<Patient>({ resourceType: 'Patient' }), {
            resourceTypes: ['Patient'],
            source: 'shard-routing.test.nested',
          });
        },
        { resourceTypes: ['Patient'], source: 'shard-routing.test.outer' }
      );
      expect(created.id).toBeDefined();
    }));

  test('dispose releases only owned connections', () =>
    withTestContext(async () => {
      const repo = getShardSystemRepo('test-shard-a');
      await repo.readResource('Patient', repo.generateId()).catch(() => undefined);
      const entry = connectionEntry(repo, 'test-shard-a');
      expect(entry.owned).toBe(true);
      const disposeSpy = vi.spyOn(entry.connection, Symbol.dispose);

      repo[Symbol.dispose]();
      expect(disposeSpy).toHaveBeenCalledOnce();
      disposeSpy.mockRestore();
    }));

  test('Repository wrapping a borrowed client is bound to its shard', () =>
    withTestContext(async () => {
      const query = vi.fn(async () => ({ rows: [] }));
      const client = { query, release: vi.fn() } as unknown as PoolClient;
      const repo = getShardSystemRepo(
        'test-shard-a',
        RepositoryConnection.borrowClient(client, {
          mode: DatabaseMode.WRITER,
          shardId: 'test-shard-a',
        })
      );

      expect((repo as any).boundShardId).toBe('test-shard-a');
      // A borrowed connection is one physical session; a global-shard read must not escape it.
      await expect(repo.readResource('User', repo.generateId())).rejects.toThrow(ShardRoutingError);

      const entry = connectionEntry(repo, 'test-shard-a');
      expect(entry.owned).toBe(false);
      assert(entry);
    }));
});
