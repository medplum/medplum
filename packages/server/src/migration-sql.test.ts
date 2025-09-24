// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Pool, PoolClient } from 'pg';
import { loadTestConfig } from './config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from './database';
import { getPostDeployVersion, markPostDeployMigrationCompleted } from './migration-sql';
import { CustomPostDeployMigration } from './migrations/data/types';
import { getLatestPostDeployMigrationVersion, MigrationVersion } from './migrations/migration-versions';
import { MigrationActionResult } from './migrations/types';

jest.mock('./migrations/data/v1', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prepareCustomMigrationJobData, runCustomMigration } = require('./workers/post-deploy-migration');
  const migration: CustomPostDeployMigration = {
    type: 'custom',
    prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
    run: function (repo, jobData) {
      return runCustomMigration(repo, jobData, async () => {
        const results: MigrationActionResult[] = [];
        results.push({ name: 'nothing', durationMs: 5 });
        return results;
      });
    },
  };

  return { migration };
});

jest.mock('./migrations/data/index', () => {
  return {
    v1: jest.requireMock('./migrations/data/v1'),
    v2: jest.requireMock('./migrations/data/v1'), // Mock v2 to be the same as v1 for testing
    v3: jest.requireMock('./migrations/data/v1'), // Mock v3 to be the same as v1 for testing
  };
});

describe('markPostDeployMigrationCompleted', () => {
  let client: Pool;
  let rowId: number;
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config);

    client = getDatabasePool(DatabaseMode.WRITER);
    const result = await client.query<{ id: number }>(
      `INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion", "firstBoot") VALUES (2, 0, $1, true)
        ON CONFLICT("id") DO UPDATE SET "id" = EXCLUDED."id", "version" = EXCLUDED."version", "dataVersion" = EXCLUDED."dataVersion"
        RETURNING *`,
      [MigrationVersion.FIRST_BOOT]
    );
    rowId = result.rows[0].id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function setDataVersionState(
    client: Pool | PoolClient,
    dataVersion: number,
    firstBoot: boolean
  ): Promise<void> {
    await client.query('UPDATE "DatabaseMigration" SET "dataVersion" = $1, "firstBoot" = $2 WHERE "id" = $3', [
      dataVersion,
      firstBoot,
      rowId,
    ]);
  }

  test('From dataVersion MigrationVersion.FIRST_BOOT', async () => {
    await setDataVersionState(client, 0, true);

    const latestVersion = getLatestPostDeployMigrationVersion();

    // sanity check mocking
    expect(latestVersion).toEqual(3);

    await markPostDeployMigrationCompleted(client, 1, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(MigrationVersion.FIRST_BOOT);

    await markPostDeployMigrationCompleted(client, latestVersion, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(latestVersion);
  });

  test('From dataVersion 0', async () => {
    await setDataVersionState(client, 0, false);

    const latestVersion = getLatestPostDeployMigrationVersion();
    // sanity check mocking
    expect(latestVersion).toEqual(3);

    await markPostDeployMigrationCompleted(client, 1, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(1);

    await markPostDeployMigrationCompleted(client, latestVersion, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(latestVersion);
  });
});
