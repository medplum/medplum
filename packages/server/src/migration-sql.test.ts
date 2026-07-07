// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Pool, PoolClient } from 'pg';
import { vi } from 'vitest';
import { loadTestConfig } from './config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from './database';
import { getPostDeployVersion, markPostDeployMigrationCompleted } from './migration-sql';
import type { CustomPostDeployMigration } from './migrations/data/types';
import type * as MigrationDataV1 from './migrations/data/v1';
import { getLatestPostDeployMigrationVersion, MigrationVersion } from './migrations/migration-versions';
import type * as PostDeployMigration from './workers/post-deploy-migration';

const migrationMocks = vi.hoisted(() => ({
  customMigration: undefined as CustomPostDeployMigration | undefined,
}));

vi.mock('./migrations/data/v1', async () => {
  const { prepareCustomMigrationJobData, runCustomMigration } = await vi.importActual<typeof PostDeployMigration>(
    './workers/post-deploy-migration'
  );
  migrationMocks.customMigration = {
    type: 'custom',
    prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
    run: function (repo, job, jobData) {
      return runCustomMigration(repo, job, jobData, async (_client, results) => {
        results.push({ name: 'nothing', durationMs: 5 });
      });
    },
  };

  return { migration: migrationMocks.customMigration };
});

vi.mock('./migrations/data/index', async () => {
  return {
    v1: await vi.importMock<typeof MigrationDataV1>('./migrations/data/v1'),
    v2: await vi.importMock<typeof MigrationDataV1>('./migrations/data/v1'), // Mock v2 to be the same as v1 for testing
    v3: await vi.importMock<typeof MigrationDataV1>('./migrations/data/v1'), // Mock v3 to be the same as v1 for testing
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

    await markPostDeployMigrationCompleted(client, 1, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(MigrationVersion.FIRST_BOOT);

    await markPostDeployMigrationCompleted(client, latestVersion, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(latestVersion);
  });

  test('From dataVersion 0', async () => {
    await setDataVersionState(client, 0, false);

    const latestVersion = getLatestPostDeployMigrationVersion();

    await markPostDeployMigrationCompleted(client, 1, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(1);

    await markPostDeployMigrationCompleted(client, latestVersion, { rowId });
    expect(await getPostDeployVersion(client, { rowId })).toEqual(latestVersion);
  });
});
