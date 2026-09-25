// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob } from '@medplum/fhirtypes';
import { loadTestConfig } from '../config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import type { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import * as migrationSql from '../migration-sql';
import {
  completePostDeployMigration,
  getPostDeployMigration,
  MigrationDefinitionNotFoundError,
  withLongRunningDatabaseClient,
} from './migration-utils';
import { MigrationVersion } from './migration-versions';

describe('withLongRunningDatabaseClient', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('should execute callback with long-running database client', async () => {
    const result = await withLongRunningDatabaseClient(async (client) => {
      return client.query<{ result: string }>("SELECT '12-12-2022' as result").then((result) => result.rows[0].result);
    }, GLOBAL_SHARD_ID);
    expect(result).toBe('12-12-2022');
  });

  test('completes a data migration on its target shard independently of the AsyncJob repository', async () => {
    const asyncJob: WithId<AsyncJob> = {
      resourceType: 'AsyncJob',
      id: 'data-migration-job',
      type: 'data-migration',
      status: 'accepted',
      request: 'data-migration-v1',
      requestTime: new Date().toISOString(),
      dataVersion: 1,
    };
    const completedJob: WithId<AsyncJob> = { ...asyncJob, status: 'completed' };
    const exec = {
      repo: { shardId: 'async-job-shard' },
      getAsyncJob: vi.fn(() => asyncJob),
      completeJob: vi.fn(async () => completedJob),
    } as unknown as AsyncJobExecutor;
    const markCompletedSpy = vi
      .spyOn(migrationSql, 'markPostDeployMigrationCompleted')
      .mockResolvedValue(asyncJob.dataVersion);
    const getVersionSpy = vi.spyOn(migrationSql, 'getPostDeployVersion').mockResolvedValue(MigrationVersion.NONE);

    await expect(completePostDeployMigration(exec, GLOBAL_SHARD_ID)).resolves.toBe(completedJob);

    expect(markCompletedSpy).toHaveBeenCalledWith(getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID), 1);
    expect(exec.completeJob).toHaveBeenCalledOnce();

    markCompletedSpy.mockRestore();
    getVersionSpy.mockRestore();
  });
});

describe('getPostDeployMigration', () => {
  test('definition found', () => {
    expect(getPostDeployMigration(1)).toBeDefined();
  });

  test('migration definition not found', () => {
    expect(() => getPostDeployMigration(9999)).toThrow(MigrationDefinitionNotFoundError);
  });
});
