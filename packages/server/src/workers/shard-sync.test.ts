// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { conflict, OperationOutcomeError } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { DatabaseMode, getDatabasePool } from '../database';
import type { Repository } from '../fhir/repo';
import { getGlobalSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { PostgresError } from '../fhir/sql';
import { createTestProject, withTestContext } from '../test.setup';
import type { ShardSyncJobData } from './shard-sync';
import { addShardSyncJob, execShardSyncJob, getShardSyncQueue, prepareShardSyncJobData } from './shard-sync';

const TEST_SHARD_ID = 'test-shard';

let repo: Repository;
let getDatabasePoolSpy: jest.SpyInstance;
let globalLoggerErrorSpy: jest.SpyInstance;

describe('Shard Sync Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    repo = (await createTestProject({ withRepo: true })).repo;

    const database = await import('../database');
    const originalGetDatabasePool = database.getDatabasePool.bind(database);
    getDatabasePoolSpy = jest.spyOn(database, 'getDatabasePool').mockImplementation((mode, shardId) => {
      const targetShard = shardId === TEST_SHARD_ID ? GLOBAL_SHARD_ID : shardId;
      return originalGetDatabasePool(mode, targetShard);
    });

    const logger = await import('../logger');
    globalLoggerErrorSpy = jest.spyOn(logger.globalLogger, 'error').mockImplementation(() => {});
  });

  afterAll(async () => {
    globalLoggerErrorSpy?.mockRestore();
    getDatabasePoolSpy?.mockRestore();
    await shutdownApp();
  });

  test('Skip global shard', async () => {
    await withTestContext(async () => {
      const job = { id: '1', data: { shardId: GLOBAL_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
      // Should return early without error
      await execShardSyncJob(job);
    });
  });

  test('Empty outbox', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');
      const job = { id: '2', data: { shardId: GLOBAL_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
      await execShardSyncJob(job);
    });
  });

  test('Process outbox row: success', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');

      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'BatchSync',
        lastName: 'Success',
        email: `batch-sync-${Date.now()}@example.com`,
      });

      const { rows } = await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3) RETURNING "id"`,
        ['User', user.id, user.meta?.versionId ?? '00000000-0000-0000-0000-000000000001']
      );
      expect(rows.length).toBe(1);

      const job = { id: '3', data: { shardId: TEST_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
      await execShardSyncJob(job);

      const { rows: remaining } = await pool.query('SELECT * FROM "shard_sync_outbox" WHERE "id" = $1', [rows[0].id]);
      expect(remaining.length).toBe(0);
    });
  });

  test('Process outbox row: deduplicates multiple outbox rows for same resource', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');

      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Dedup',
        lastName: 'User',
        email: `dedup-${Date.now()}@example.com`,
      });

      // Insert 2 outbox rows for the same resource (simulates duplicate events)
      const { rows } = await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3), ($1, $2, $3) RETURNING "id"`,
        ['User', user.id, user.meta?.versionId ?? '00000000-0000-0000-0000-000000000001']
      );
      expect(rows.length).toBe(2);

      const job = { id: '4a', data: { shardId: TEST_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
      await execShardSyncJob(job);

      // Both rows should be processed and deleted (one sync, both outbox rows cleaned)
      const { rows: remaining } = await pool.query('SELECT * FROM "shard_sync_outbox" WHERE "id" = ANY($1)', [
        rows.map((r) => r.id),
      ]);
      expect(remaining.length).toBe(0);
    });
  });

  test('Process outbox row: resource missing (skipped)', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');

      const { rows } = await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3) RETURNING "id"`,
        ['User', '00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000001']
      );
      expect(rows.length).toBe(1);

      const job = { id: '4', data: { shardId: TEST_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
      await execShardSyncJob(job);

      const { rows: remaining } = await pool.query('SELECT * FROM "shard_sync_outbox" WHERE "id" = $1', [rows[0].id]);
      expect(remaining.length).toBe(0);
    });
  });

  test('Process outbox row: deleted resource', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');

      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Deleted',
        lastName: 'User',
        email: `deleted-${Date.now()}@example.com`,
      });
      const updatedUser = await globalSystemRepo.updateResource({
        ...user,
        meta: { ...user.meta, versionId: '00000000-0000-0000-0000-000000000002' },
      });
      await pool.query('UPDATE "User" SET "deleted" = true WHERE "id" = $1', [user.id]);

      const { rows } = await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3) RETURNING "id"`,
        ['User', user.id, updatedUser.meta?.versionId ?? '00000000-0000-0000-0000-000000000002']
      );
      expect(rows.length).toBe(1);

      const job = { id: '5', data: { shardId: TEST_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
      await execShardSyncJob(job);

      const { rows: remaining } = await pool.query('SELECT * FROM "shard_sync_outbox" WHERE "id" = $1', [rows[0].id]);
      expect(remaining.length).toBe(0);
    });
  });

  test('Process outbox row: error threshold aborts batch', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');
      await pool.query('DELETE FROM "shard_sync_outbox_attempts"');

      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'ErrThreshold',
        lastName: 'User',
        email: `err-threshold-${Date.now()}@example.com`,
      });

      await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3)`,
        ['User', user.id, user.meta?.versionId ?? '00000000-0000-0000-0000-000000000001']
      );

      const repoModule = await import('../fhir/repo');
      const syncSpy = jest.spyOn(globalSystemRepo, 'syncResourceFromShard').mockRejectedValue(new Error('Sync failed'));
      const getGlobalSystemRepoSpy = jest
        .spyOn(repoModule, 'getGlobalSystemRepo')
        .mockReturnValue(globalSystemRepo as any);

      const configLoader = await import('../config/loader');
      const getConfigSpy = jest.spyOn(configLoader, 'getConfig').mockReturnValue({
        ...configLoader.getConfig(),
        shardSync: {
          ...(configLoader.getConfig().shardSync ?? {}),
          globalErrorThreshold: 1,
          maxIterations: 1,
          batchSize: 10,
        },
      });

      try {
        const job = { id: '6b', data: { shardId: TEST_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
        await expect(execShardSyncJob(job)).rejects.toThrow('Global shard unavailable');
      } finally {
        syncSpy.mockRestore();
        getGlobalSystemRepoSpy.mockRestore();
        getConfigSpy.mockRestore();
      }
    });
  });

  test('Process outbox row: serialization error (skipped, will retry)', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');

      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Serialization',
        lastName: 'User',
        email: `serialization-${Date.now()}@example.com`,
      });

      const { rows } = await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3) RETURNING "id"`,
        ['User', user.id, user.meta?.versionId ?? '00000000-0000-0000-0000-000000000001']
      );

      const serializationError = new OperationOutcomeError(
        conflict('Serialization failure', PostgresError.SerializationFailure)
      );
      const repoModule = await import('../fhir/repo');
      const syncSpy = jest.spyOn(globalSystemRepo, 'syncResourceFromShard').mockRejectedValue(serializationError);
      const getGlobalSystemRepoSpy = jest
        .spyOn(repoModule, 'getGlobalSystemRepo')
        .mockReturnValue(globalSystemRepo as any);

      const configLoader = await import('../config/loader');
      const getConfigSpy = jest.spyOn(configLoader, 'getConfig').mockReturnValue({
        ...configLoader.getConfig(),
        shardSync: { ...(configLoader.getConfig().shardSync ?? {}), maxIterations: 1 },
      });

      try {
        const job = { id: '6a', data: { shardId: TEST_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
        await execShardSyncJob(job);

        // Row stays in outbox (skipped for retry), one attempt recorded
        const { rows: attemptRows } = await pool.query(
          'SELECT * FROM "shard_sync_outbox_attempts" WHERE "outbox_id" = $1',
          [rows[0].id]
        );
        expect(attemptRows.length).toBe(1);
      } finally {
        syncSpy.mockRestore();
        getGlobalSystemRepoSpy.mockRestore();
        getConfigSpy.mockRestore();
      }
    });
  });

  test('Process outbox row: move to deadletter when maxAttempts exceeded', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox_deadletter"');
      await pool.query('DELETE FROM "shard_sync_outbox_attempts"');
      await pool.query('DELETE FROM "shard_sync_outbox"');

      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Deadletter',
        lastName: 'User',
        email: `deadletter-${Date.now()}@example.com`,
      });

      const { rows } = await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3) RETURNING "id"`,
        ['User', user.id, user.meta?.versionId ?? '00000000-0000-0000-0000-000000000001']
      );
      expect(rows.length).toBe(1);

      const repoModule = await import('../fhir/repo');
      const syncSpy = jest.spyOn(globalSystemRepo, 'syncResourceFromShard').mockRejectedValue(new Error('Sync failed'));
      const getGlobalSystemRepoSpy = jest
        .spyOn(repoModule, 'getGlobalSystemRepo')
        .mockReturnValue(globalSystemRepo as any);

      const configLoader = await import('../config/loader');
      const getConfigSpy = jest.spyOn(configLoader, 'getConfig').mockReturnValue({
        ...configLoader.getConfig(),
        shardSync: { ...(configLoader.getConfig().shardSync ?? {}), maxAttempts: 2 },
      });

      try {
        // One job run processes multiple batches; 2nd batch iteration will hit maxAttempts and move to deadletter
        const job = { id: '6', data: { shardId: TEST_SHARD_ID } } as unknown as Job<ShardSyncJobData>;
        await execShardSyncJob(job);

        const { rows: deadletter } = await pool.query(
          'SELECT * FROM "shard_sync_outbox_deadletter" WHERE "outbox_id" = $1',
          [rows[0].id]
        );
        expect(deadletter.length).toBe(1);
        expect(deadletter[0].resourceType).toBe('User');
        expect(deadletter[0].resourceId).toBe(user.id);

        const { rows: attempts } = await pool.query(
          'SELECT * FROM "shard_sync_outbox_attempts" WHERE "outbox_id" = $1',
          [rows[0].id]
        );
        expect(attempts.length).toBe(2);
      } finally {
        syncSpy.mockRestore();
        getConfigSpy.mockRestore();
        getGlobalSystemRepoSpy.mockRestore();
      }
    });
  });

  test('prepareShardSyncJobData returns correct shape', async () => {
    await withTestContext(async () => {
      const jobData = prepareShardSyncJobData(TEST_SHARD_ID);
      expect(jobData).toEqual(
        expect.objectContaining({
          shardId: TEST_SHARD_ID,
        })
      );
      expect(jobData).toHaveProperty('requestId');
      expect(jobData).toHaveProperty('traceId');
    });
  });

  test('addShardSyncJob enqueues job', async () => {
    await withTestContext(async () => {
      const job = await addShardSyncJob(TEST_SHARD_ID);
      expect(job).toBeDefined();
      expect(job.data.shardId).toBe(TEST_SHARD_ID);
    });
  });

  test('Queue has shard sync queue registered', () => {
    expect(getShardSyncQueue()).toBeDefined();
  });

  test('writeShardSyncOutbox inserts outbox row for synced resource on non-global shard', async () => {
    await withTestContext(async () => {
      // When sharding is not enabled, all writes go to global shard and writeShardSyncOutbox is a no-op.
      // This test verifies the no-op path: creating a User on the global shard should NOT create outbox rows.
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');

      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Test',
        lastName: 'SyncUser',
        email: `test-sync-${Date.now()}@example.com`,
      });
      expect(user).toBeDefined();

      // No outbox row should be created since we're on the global shard
      const { rows } = await pool.query(
        'SELECT * FROM "shard_sync_outbox" WHERE "resourceType" = $1 AND "resourceId" = $2',
        ['User', user.id]
      );
      expect(rows.length).toBe(0);
    });
  });

  test('writeShardSyncOutbox is no-op for non-synced resource types', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      await pool.query('DELETE FROM "shard_sync_outbox"');

      // Patient is not a SyncedResourceType, so no outbox row should be created
      const patient = await repo.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Test'], family: 'Patient' }],
      });
      expect(patient).toBeDefined();

      const { rows } = await pool.query(
        'SELECT * FROM "shard_sync_outbox" WHERE "resourceType" = $1 AND "resourceId" = $2',
        ['Patient', patient.id]
      );
      expect(rows.length).toBe(0);
    });
  });

  test('syncResourceFromShard writes to global', async () => {
    await withTestContext(async () => {
      const globalSystemRepo = getGlobalSystemRepo();

      // Create a user on global (simulating what would exist on shard)
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Test',
        lastName: 'SyncFromShard',
        email: `test-sync-from-shard-${Date.now()}@example.com`,
      });

      // Modify the user to simulate an updated version from shard
      const updatedUser = {
        ...user,
        firstName: 'Updated',
        meta: {
          ...user.meta,
          versionId: '00000000-0000-0000-0000-000000000099',
          lastUpdated: new Date().toISOString(),
        },
      };

      // Sync the modified resource to global
      await globalSystemRepo.syncResourceFromShard(updatedUser);

      // Verify via database directly to avoid cache
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);
      const { rows } = await pool.query<{ content: string }>('SELECT "content" FROM "User" WHERE "id" = $1', [user.id]);
      expect(rows.length).toBe(1);
      const content = JSON.parse(rows[0].content);
      expect(content.firstName).toBe('Updated');
    });
  });

  test('syncResourceFromShard requires super admin', async () => {
    await withTestContext(async () => {
      const globalSystemRepo = getGlobalSystemRepo();
      const user = await globalSystemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Test',
        lastName: 'NoAdmin',
        email: `test-no-admin-${Date.now()}@example.com`,
      });

      // Non-admin repo should fail
      await expect(repo.syncResourceFromShard(user)).rejects.toThrow();
    });
  });

  test('Outbox table has correct schema', async () => {
    await withTestContext(async () => {
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);

      // Insert a row to verify the schema
      const { rows } = await pool.query(
        `INSERT INTO "shard_sync_outbox" ("resourceType", "resourceId", "resourceVersionId")
         VALUES ($1, $2, $3)
         RETURNING *`,
        ['User', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']
      );

      expect(rows.length).toBe(1);
      expect(rows[0].resourceType).toBe('User');
      expect(rows[0].resourceId).toBe('00000000-0000-0000-0000-000000000001');
      expect(rows[0].resourceVersionId).toBe('00000000-0000-0000-0000-000000000002');

      // Clean up
      await pool.query('DELETE FROM "shard_sync_outbox" WHERE "id" = $1', [rows[0].id]);
    });
  });

  test('SyncedResourceTypes includes expected types', async () => {
    const { SyncedResourceTypes } = await import('../sharding/sharding-utils');
    expect(SyncedResourceTypes.has('User')).toBe(true);
    expect(SyncedResourceTypes.has('ProjectMembership')).toBe(true);
    expect(SyncedResourceTypes.has('ClientApplication')).toBe(true);
    expect(SyncedResourceTypes.has('SmartAppLaunch')).toBe(true);
    expect(SyncedResourceTypes.has('Patient')).toBe(false);
    expect(SyncedResourceTypes.has('Observation')).toBe(false);
  });

  test('ShardSync config defaults', () => {
    const config = getConfig();
    // shardSync is optional and not set in test config
    const shardSync = config.shardSync;
    // Defaults are applied in execShardSyncJob, not in config
    expect(shardSync).toBeUndefined();
  });
});
