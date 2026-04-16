// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import type { MedplumServerConfig } from './config/types';
import { DatabaseMode, getDatabasePool } from './database';
import type { SystemRepository } from './fhir/repo';
import { getGlobalSystemRepo } from './fhir/repo';
import { GLOBAL_SHARD_ID } from './fhir/sharding';
import { SelectQuery } from './fhir/sql';
import { getPostDeployVersion, getPreDeployVersion } from './migration-sql';
import {
  getPendingPostDeployMigration,
  getPostDeployMigration,
  preparePostDeployMigrationAsyncJob,
} from './migrations/migration-utils';
import { getLatestPostDeployMigrationVersion, MigrationVersion } from './migrations/migration-versions';
import { seedDatabase } from './seed';
import { withTestContext } from './test.setup';

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

  console.log(
    `${new Date().toISOString()} - Running pending post-deploy migrations ${pendingMigration} through ${lastVersion}`
  );

  for (let i = pendingMigration; i <= lastVersion; i++) {
    await synchronouslyRunPostDeployMigration(systemRepo, i);
  }
}

async function synchronouslyRunPostDeployMigration(systemRepo: SystemRepository, version: number): Promise<void> {
  const migration = getPostDeployMigration(version);
  const asyncJob = await preparePostDeployMigrationAsyncJob(systemRepo, version);
  const jobData = migration.prepareJobData({ asyncJob, shardId: systemRepo.shardId });
  console.log(`${new Date().toISOString()} - Starting post-deploy migration v${version}`);
  const result = await migration.run(systemRepo, undefined, jobData);
  console.log(`${new Date().toISOString()} - Post-deploy migration v${version} result: ${result}`);
}

describe('Seed', () => {
  let config: MedplumServerConfig;
  const originalConsoleLog = console.log;
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(async () => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(jest.fn());

    config = await loadTestConfig();
    config.database.runMigrations = true;
    // Since BullMQ is not available in tests, disable automatically running post-deploy migrations
    // asynchronously. Instead, run them synchronously below.
    config.database.disableRunPostDeployMigrations = true;
    for (const shardConfig of Object.values(config.shards ?? {})) {
      shardConfig.database.runMigrations = true;
      shardConfig.database.disableRunPostDeployMigrations = true;
    }

    console.log(`${new Date().toISOString()} - Initializing app services`);
    await initAppServices(config);
    await withTestContext(async () => {
      // Run post-deploy migrations synchronously
      await synchronouslyRunAllPendingPostDeployMigrations(getGlobalSystemRepo());
    });
  });

  afterAll(async () => {
    await shutdownApp();
    consoleLogSpy.mockRestore();
  });

  test('Seeder completes successfully', () =>
    withTestContext(async () => {
      // seedDatabase will have already been executed in beforeAll

      // Make sure all database migrations have run
      const pool = getDatabasePool(DatabaseMode.WRITER, GLOBAL_SHARD_ID);

      const preDeployVersion = await getPreDeployVersion(pool);
      expect(preDeployVersion).toBeGreaterThanOrEqual(67);

      const postDeployVersion = await getPostDeployVersion(pool);
      // only show log messages if post-deploy migrations did not run successfully
      if (getLatestPostDeployMigrationVersion() !== postDeployVersion) {
        consoleLogSpy.mock.calls.forEach((call) => originalConsoleLog(...call));
      }
      expect(postDeployVersion).toEqual(getLatestPostDeployMigrationVersion());

      // One Super Admin project per shard on or synced to global
      const rows = await new SelectQuery('Project').column('content').where('name', '=', 'Super Admin').execute(pool);
      const shardCount = config.shards ? Object.keys(config.shards).length : 1;
      expect(rows.length).toBe(shardCount);

      for (const row of rows) {
        const project = JSON.parse(row.content) as WithId<Project>;
        expect(project.superAdmin).toBe(true);
        expect(project.strictMode).toBe(true);
      }

      // seedDatabase is idempotent
      await seedDatabase(config);
    }));
});
