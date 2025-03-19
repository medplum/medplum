import { Pool, PoolClient } from 'pg';
import { loadTestConfig } from './config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from './database';
import { markPostDeployMigrationCompleted, MigrationVersion } from './migration-sql';
import { CustomMigrationAction, CustomPostDeployMigration } from './migrations/data/types';
import { getLatestPostDeployMigrationVersion } from './migrations/migration-utils';

jest.mock('./migrations/data/v1', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prepareCustomMigrationJobData, runCustomMigration } = require('./workers/post-deploy-migration');
  const migration: CustomPostDeployMigration = {
    type: 'custom',
    prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
    run: function (repo, jobData) {
      return runCustomMigration(repo, jobData, async () => {
        const actions: CustomMigrationAction[] = [];
        actions.push({ name: 'nothing', durationMs: 5 });
        return { actions };
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
  let rowId: number;
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config);

    const client = getDatabasePool(DatabaseMode.WRITER);
    const result = await client.query<{ id: number }>(
      `INSERT INTO "DatabaseMigration" ("id", "version", "dataVersion") VALUES (2, 0, $1)
        ON CONFLICT("id") DO UPDATE SET "id" = EXCLUDED."id", "version" = EXCLUDED."version", "dataVersion" = EXCLUDED."dataVersion"
        RETURNING *`,
      [MigrationVersion.FIRST_BOOT]
    );
    rowId = result.rows[0].id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function setDataVersion(client: Pool | PoolClient, dataVersion: number): Promise<void> {
    await client.query('UPDATE "DatabaseMigration" SET "dataVersion" = $1 WHERE "id" = $2', [dataVersion, rowId]);
  }

  test('From dataVersion MigrationVersion.FIRST_BOOT', async () => {
    const client = getDatabasePool(DatabaseMode.WRITER);
    await setDataVersion(client, MigrationVersion.FIRST_BOOT);

    const latestVersion = getLatestPostDeployMigrationVersion();

    // sanity check mocking
    expect(latestVersion).toEqual(3);

    const newDataVersion = await markPostDeployMigrationCompleted(client, 1, { id: rowId });
    expect(newDataVersion).toEqual(undefined);

    const newDataVersion2 = await markPostDeployMigrationCompleted(client, latestVersion, { id: rowId });
    expect(newDataVersion2).toEqual(latestVersion);
  });

  test('From dataVersion 0', async () => {
    const client = getDatabasePool(DatabaseMode.WRITER);
    await setDataVersion(client, 0);

    const latestVersion = getLatestPostDeployMigrationVersion();
    // sanity check mocking
    expect(latestVersion).toEqual(3);

    const newDataVersion = await markPostDeployMigrationCompleted(client, 1, { id: rowId });
    expect(newDataVersion).toEqual(1);

    const newDataVersion2 = await markPostDeployMigrationCompleted(client, latestVersion, { id: rowId });
    expect(newDataVersion2).toEqual(latestVersion);
  });
});
