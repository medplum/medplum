// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import { DatabaseMode, getDatabasePool } from './database';
import { getSystemRepo, Repository } from './fhir/repo';
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

async function synchronouslyRunAllPendingPostDeployMigrations(): Promise<void> {
  const lastVersion = getLatestPostDeployMigrationVersion();

  const pendingMigration = await getPendingPostDeployMigration(getDatabasePool(DatabaseMode.WRITER));
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
    await synchronouslyRunPostDeployMigration(getSystemRepo(), i);
  }
}

async function synchronouslyRunPostDeployMigration(systemRepo: Repository, version: number): Promise<void> {
  const migration = getPostDeployMigration(version);
  const asyncJob = await preparePostDeployMigrationAsyncJob(systemRepo, version);
  const jobData = migration.prepareJobData(asyncJob);
  console.log(`${new Date().toISOString()} - Starting post-deploy migration v${version}`);
  const result = await migration.run(systemRepo, undefined, jobData);
  console.log(`${new Date().toISOString()} - Post-deploy migration v${version} result: ${result}`);
}

describe('Seed', () => {
  const originalConsoleLog = console.log;
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(async () => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(jest.fn());

    const config = await loadTestConfig();
    config.database.runMigrations = true;
    // Since BullMQ is not available in tests, disable automatically running post-deploy migrations
    // asynchronously. Instead, run them synchronously below.
    config.database.disableRunPostDeployMigrations = true;

    console.log(`${new Date().toISOString()} - Initializing app services`);
    await initAppServices(config);
    await withTestContext(async () => {
      // Run post-deploy migrations synchronously
      await synchronouslyRunAllPendingPostDeployMigrations();
    });
  });

  afterAll(async () => {
    await shutdownApp();
    consoleLogSpy.mockRestore();
  });

  test('Seeder completes successfully', () =>
    withTestContext(async () => {
      // Seeder was already run as part of `initAppServices`, but run it again
      // incase it is ever removed from `initAppServices`
      await seedDatabase();

      // Make sure all database migrations have run
      const pool = getDatabasePool(DatabaseMode.WRITER);

      const preDeployVersion = await getPreDeployVersion(pool);
      expect(preDeployVersion).toBeGreaterThanOrEqual(67);

      const postDeployVersion = await getPostDeployVersion(pool);
      // only show log messages if post-deploy migrations did not run successfully
      if (getLatestPostDeployMigrationVersion() !== postDeployVersion) {
        consoleLogSpy.mock.calls.forEach((call) => originalConsoleLog(...call));
      }
      expect(postDeployVersion).toEqual(getLatestPostDeployMigrationVersion());

      // Make sure the first project is a super admin
      const rows = await new SelectQuery('Project').column('content').where('name', '=', 'Super Admin').execute(pool);
      expect(rows.length).toBe(1);

      const project = JSON.parse(rows[0].content) as Project;
      expect(project.superAdmin).toBe(true);
      expect(project.strictMode).toBe(true);

      // Second time, seeder should silently ignore
      await seedDatabase();
    }));
});
