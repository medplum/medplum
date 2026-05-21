// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import { DatabaseMode, getDatabasePool } from './database';
import type { OutputAction } from './fhir/operations/db-configure-indexes';
import { configureGinIndexes, vacuumTable } from './fhir/operations/db-configure-indexes';
import type { SystemRepository } from './fhir/repo';
import { getGlobalSystemRepo } from './fhir/repo';
import { SelectQuery } from './fhir/sql';
import { globalLogger } from './logger';
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

  const pendingMigration = await getPendingPostDeployMigration(getDatabasePool(DatabaseMode.WRITER));
  if (pendingMigration === MigrationVersion.UNKNOWN) {
    throw new Error('Post-deploy migration version is unknown');
  }

  if (pendingMigration === MigrationVersion.NONE) {
    return;
  }

  globalLogger.write(
    `${new Date().toISOString()} - Running pending post-deploy migrations ${pendingMigration} through ${lastVersion}`
  );

  for (let i = pendingMigration; i <= lastVersion; i++) {
    await synchronouslyRunPostDeployMigration(systemRepo, i);
  }
}

async function synchronouslyRunPostDeployMigration(systemRepo: SystemRepository, version: number): Promise<void> {
  const migration = getPostDeployMigration(version);
  const asyncJob = await preparePostDeployMigrationAsyncJob(systemRepo, version);
  const jobData = migration.prepareJobData(asyncJob);
  globalLogger.write(`${new Date().toISOString()} - Starting post-deploy migration v${version}`);
  const result = await migration.run(systemRepo, undefined, jobData);
  globalLogger.write(`${new Date().toISOString()} - Post-deploy migration v${version} result: ${result}`);
}

describe('Seed', () => {
  let loggerWriteSpy: jest.SpyInstance;

  beforeAll(async () => {
    loggerWriteSpy = jest.spyOn(globalLogger, 'write' as any).mockImplementation(() => undefined);

    const config = await loadTestConfig();
    config.database.runMigrations = true;
    // Since BullMQ is not available in tests, disable automatically running post-deploy migrations
    // asynchronously. Instead, run them synchronously below.
    config.database.disableRunPostDeployMigrations = true;

    globalLogger.write(`${new Date().toISOString()} - Initializing app services`);
    await initAppServices(config);
    await withTestContext(async () => {
      const repo = getGlobalSystemRepo();
      // Run post-deploy migrations synchronously
      await synchronouslyRunAllPendingPostDeployMigrations(repo);

      // Scheduling features use serializable transactions that touch these
      // tables. The `fastUpdate` feature can cause seemingly unrelated transactions
      // to append to the same "pending list", which can cause transaction
      // failures.
      //
      // Here we update the indexes on Appointment and Slot tables to disable `fastUpdate`,
      // and then vacuum the tables to clear any existing pending list entries.
      const actions: OutputAction[] = [];
      const tables = ['Appointment', 'Appointment_References', 'Slot', 'Slot_References'];
      const client = repo.getDatabaseClient(DatabaseMode.WRITER);
      await configureGinIndexes(client, actions, tables, { fastUpdate: false });
      for (const table of tables) {
        await vacuumTable(client, actions, table);
      }
    });
  });

  afterAll(async () => {
    await shutdownApp();
    loggerWriteSpy.mockRestore();
  });

  test('Seeder completes successfully', () =>
    withTestContext(async () => {
      const config = await loadTestConfig();

      // Seeder was already run as part of `initAppServices`, but run it again
      // incase it is ever removed from `initAppServices`
      await seedDatabase(config);

      // Make sure all database migrations have run
      const pool = getDatabasePool(DatabaseMode.WRITER);

      const preDeployVersion = await getPreDeployVersion(pool);
      expect(preDeployVersion).toBeGreaterThanOrEqual(67);

      const postDeployVersion = await getPostDeployVersion(pool);
      // only show log messages if post-deploy migrations did not run successfully
      if (getLatestPostDeployMigrationVersion() !== postDeployVersion) {
        loggerWriteSpy.mock.calls.forEach((call) => console.log(...call));
      }
      expect(postDeployVersion).toEqual(getLatestPostDeployMigrationVersion());

      // Make sure the first project is a super admin
      const rows = await new SelectQuery('Project').column('content').where('name', '=', 'Super Admin').execute(pool);
      expect(rows.length).toBe(1);

      const project = JSON.parse(rows[0].content) as Project;
      expect(project.superAdmin).toBe(true);
      expect(project.strictMode).toBe(true);

      // Second time, seeder should silently ignore
      await seedDatabase(config);
    }));
});
