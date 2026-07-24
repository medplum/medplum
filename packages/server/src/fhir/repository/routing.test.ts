// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { RepositoryMode } from '@medplum/fhir-router';
import type { Pool } from 'pg';
import { vi } from 'vitest';
import { loadTestConfig } from '../../config/loader';
import { closeDatabase, registerDatabaseShard } from '../../database';
import { getLogger } from '../../logger';
import { Repository } from '../repo';
import { GLOBAL_SHARD_ID } from '../sharding';
import { repoAccess } from './access-tracker';

describe('Repository database routing', () => {
  const globalWriter = createPool();
  const globalReader = createPool();
  const projectWriter = createPool();
  const projectReader = createPool();

  beforeAll(async () => {
    await loadTestConfig();
    registerDatabaseShard(GLOBAL_SHARD_ID, globalWriter, globalReader);
    registerDatabaseShard('project-shard', projectWriter, projectReader);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Routes global and project resource types to their resolved shard pools', () => {
    const repo = createRepo('project-shard');
    repo.setMode(RepositoryMode.READER);

    try {
      expect(repo.getDatabaseClient(repoAccess.sqlRead('Patient'))).toBe(projectReader);
      expect(repo.getDatabaseClient(repoAccess.sqlRead('Project'))).toBe(globalReader);
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Allows and logs logical mixing when the project is on the global shard', () => {
    const infoSpy = vi.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const repo = createRepo(GLOBAL_SHARD_ID);
    repo.setMode(RepositoryMode.READER);

    try {
      expect(
        repo.getDatabaseClient(repoAccess.sqlRead(['Project', 'Patient'], { source: 'routing.test.coLocated' }))
      ).toBe(globalReader);
      expect(infoSpy).toHaveBeenCalledWith(
        '[RepoSplit] Mixed resource access',
        expect.objectContaining({
          specialResourceTypes: ['Project'],
          otherResourceTypes: ['Patient'],
        })
      );
    } finally {
      repo[Symbol.dispose]();
      infoSpy.mockRestore();
    }
  });

  test('Rejects mixed SQL access when resource types resolve to different shards', () => {
    const repo = createRepo('project-shard');

    try {
      expect(() =>
        repo.getDatabaseClient(repoAccess.sqlRead(['Project', 'Patient'], { source: 'routing.test.mixedShardSql' }))
      ).toThrow('Repository access spans database shards (global, project-shard): Project, Patient');
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Rejects mixed transactions before opening a database connection', async () => {
    const repo = createRepo('project-shard');

    try {
      await expect(
        repo.withTransaction(async () => undefined, {
          resourceTypes: ['Project', 'Patient'],
          source: 'routing.test.mixedShardTransaction',
        })
      ).rejects.toThrow('Repository access spans database shards (global, project-shard): Project, Patient');
      expect(projectWriter.connect).not.toHaveBeenCalled();
      expect(globalWriter.connect).not.toHaveBeenCalled();
    } finally {
      repo[Symbol.dispose]();
    }
  });

  test('Prevents transactions from starting concurrently on different shards', async () => {
    const repo = createRepo('project-shard');
    const transactionGate = Promise.withResolvers<undefined>();

    try {
      const projectTransaction = repo.withTransaction(async () => transactionGate.promise, {
        resourceTypes: ['Patient'],
        source: 'routing.test.concurrentProjectTransaction',
      });

      await expect(
        repo.withTransaction(async () => undefined, {
          resourceTypes: ['Project'],
          source: 'routing.test.concurrentGlobalTransaction',
        })
      ).rejects.toThrow('Repository access spans database shards (project-shard, global): Project');

      transactionGate.resolve(undefined);
      await projectTransaction;
      expect(globalWriter.connect).not.toHaveBeenCalled();
    } finally {
      transactionGate.resolve(undefined);
      repo[Symbol.dispose]();
    }
  });

  test('Allows explicitly sequenced cross-shard work after the first transaction commits', async () => {
    const repo = createRepo('project-shard');
    const events: string[] = [];

    try {
      await repo.withTransaction(
        async (projectTxRepo) => {
          events.push('project transaction');
          await projectTxRepo.postCommit(async () => {
            events.push('project committed');
            await projectTxRepo.withTransaction(
              async () => {
                events.push('global transaction');
              },
              {
                resourceTypes: ['Project'],
                source: 'routing.test.sequencedGlobalTransaction',
              }
            );
          });
        },
        {
          resourceTypes: ['Patient'],
          source: 'routing.test.sequencedProjectTransaction',
        }
      );

      expect(events).toStrictEqual(['project transaction', 'project committed', 'global transaction']);
      expect(projectWriter.connect).toHaveBeenCalled();
      expect(globalWriter.connect).toHaveBeenCalled();
    } finally {
      repo[Symbol.dispose]();
    }
  });
});

function createRepo(shardId: string): Repository {
  return new Repository({
    shardId,
    superAdmin: true,
    author: { reference: 'system' },
  });
}

function createPool(): Pool {
  return {
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    })),
    end: vi.fn(),
    query: vi.fn(),
  } as unknown as Pool;
}
