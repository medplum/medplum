// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import type { Mock } from 'vitest';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import type { ServerConfig } from './config/utils';
import { DatabaseMode, getDatabasePool } from './database';
import type { OutputAction } from './fhir/operations/db-configure-indexes';
import { configureGinIndexes } from './fhir/operations/db-configure-indexes';
import type { SystemRepository } from './fhir/repo';
import { getGlobalSystemRepo, getShardSystemRepo } from './fhir/repo';
import { getAllShards, GLOBAL_SHARD_ID } from './fhir/sharding';
import { globalLogger } from './logger';
import { getPostDeployVersion, getPreDeployVersion } from './migration-sql';
import {
  getPendingPostDeployMigration,
  getPostDeployMigration,
  preparePostDeployMigrationAsyncJob,
} from './migrations/migration-utils';
import {
  getLatestPostDeployMigrationVersion,
  getPreDeployMigrationVersions,
  MigrationVersion,
} from './migrations/migration-versions';
import { closeRedis, getCacheRedis, initRedis } from './redis';
import * as seedModule from './seed';
import { deleteRedisKeys, withTestContext } from './test.setup';

async function synchronouslyRunAllPendingPostDeployMigrations(systemRepo: SystemRepository): Promise<void> {
  const lastVersion = getLatestPostDeployMigrationVersion();

  const pendingMigration = await getPendingPostDeployMigration(
    getDatabasePool(DatabaseMode.WRITER, systemRepo.shardId)
  );
  if (pendingMigration === MigrationVersion.UNKNOWN) {
    throw new Error('Post-deploy migration version is unknown');
  }

  if (pendingMigration === MigrationVersion.NONE) {
    return;
  }

  globalLogger.write(
    `${new Date().toISOString()} - [${systemRepo.shardId}] Running pending post-deploy migrations ${pendingMigration} through ${lastVersion}`
  );

  for (let i = pendingMigration; i <= lastVersion; i++) {
    await synchronouslyRunPostDeployMigration(systemRepo, i);
  }
}

async function synchronouslyRunPostDeployMigration(systemRepo: SystemRepository, version: number): Promise<void> {
  const migration = getPostDeployMigration(version);
  const asyncJob = await preparePostDeployMigrationAsyncJob(systemRepo, version);
  const jobData = migration.prepareJobData({ shardId: systemRepo.shardId, asyncJob });
  globalLogger.write(
    `${new Date().toISOString()} - [${systemRepo.shardId}] Starting post-deploy migration v${version}`
  );
  const result = await migration.run(systemRepo, undefined, jobData);
  globalLogger.write(
    `${new Date().toISOString()} - [${systemRepo.shardId}] Post-deploy migration v${version} result: ${result}`
  );
}

describe('Seed', () => {
  let config: ServerConfig;
  let loggerWriteSpy: Mock<typeof globalLogger.write>;
  let seedDatabaseSpy: Mock<(typeof seedModule)['seedDatabase']>;

  beforeAll(async () => {
    loggerWriteSpy = vi.spyOn(globalLogger, 'write'); // .mockImplementation(() => undefined);
    seedDatabaseSpy = vi.spyOn(seedModule, 'seedDatabase');

    config = await loadTestConfig({ sharded: true });
    config.database.runMigrations = true;
    // Since BullMQ is not available in tests, disable automatically running post-deploy migrations
    // asynchronously. Instead, run them synchronously below.
    config.database.disableRunPostDeployMigrations = true;
    for (const shardConfig of getAllShards()) {
      shardConfig.database.runMigrations = true;
      shardConfig.database.disableRunPostDeployMigrations = true;
    }

    // Delete all cache Redis keys to ensure a clean slate since the cache may be out of
    // sync with the database, e.g. if postgres/init_test.sql or something similar was run beforehand.
    // On CI/CD this is effectively a noop since a fresh Redis server is used for each test run
    await initRedis(config);
    await deleteRedisKeys(getCacheRedis(), '');
    await closeRedis();

    globalLogger.write(`${new Date().toISOString()} - Initializing app services`);
    await initAppServices(config);

    for (const shardConfig of getAllShards()) {
      const systemRepo = getShardSystemRepo(shardConfig.id);
      await synchronouslyRunAllPendingPostDeployMigrations(systemRepo);

      // Scheduling and user creation use serializable transactions that touch these
      // tables. The `fastUpdate` feature can cause seemingly unrelated transactions
      // to append to the same "pending list", which can cause transaction
      // failures.
      //
      // Here we update the indexes on Appointment, Slot, and User tables to disable `fastUpdate`,
      // and then vacuum the tables to clear any existing pending list entries.
      const pool = getDatabasePool(DatabaseMode.WRITER, shardConfig.id);
      const actions: OutputAction[] = [];
      const tables = ['Appointment', 'Slot', 'User'];
      await configureGinIndexes(pool, actions, tables, { fastUpdate: false });
    }
  });

  afterAll(async () => {
    await shutdownApp();
    loggerWriteSpy.mockRestore();
    seedDatabaseSpy.mockRestore();
  });

  test('Seeder completes successfully', () =>
    withTestContext(async () => {
      // // seedDatabase executed in beforeAll via initAppServices
      expect(seedDatabaseSpy).toHaveBeenCalledTimes(1);

      for (const shardConfig of getAllShards()) {
        const pool = getDatabasePool(DatabaseMode.WRITER, shardConfig.id);

        const preDeployVersion = await getPreDeployVersion(pool);
        expect(preDeployVersion).toBeGreaterThanOrEqual(67);
        expect(preDeployVersion).toBe(getPreDeployMigrationVersions().at(-1) as number);

        const postDeployVersion = await getPostDeployVersion(pool);

        // only show log messages if post-deploy migrations did not run successfully
        if (getLatestPostDeployMigrationVersion() !== postDeployVersion) {
          loggerWriteSpy.mock.calls.forEach((call: unknown[]) => console.log(...call));
          expect(postDeployVersion).toEqual(getLatestPostDeployMigrationVersion());
        }
      }

      // confirm seedDatabase is idempotent
      await seedDatabaseSpy(config);

      const projects = await getGlobalSystemRepo().searchResources<Project>({
        resourceType: 'Project',
        filters: [{ code: 'name', operator: 'eq', value: 'Super Admin' }],
      });
      expect(projects.length).toBe(1);
      for (const project of projects) {
        expect(project).toMatchObject({
          name: 'Super Admin',
          superAdmin: true,
          strictMode: true,
          shard: [{ id: GLOBAL_SHARD_ID }],
        });
      }
    }));
});
