import assert from 'assert';
import { Pool, PoolClient } from 'pg';
import { getLatestPostDeployMigrationVersion, MigrationVersion } from './migrations/migration-versions';

export const GetVersionSql = 'SELECT "version" FROM "DatabaseMigration" WHERE "id" = 1';
export const GetDataVersionSql = 'SELECT "dataVersion" FROM "DatabaseMigration" WHERE "id" = 1';

export async function getPreDeployVersion(client: Pool | PoolClient): Promise<number> {
  // This generic type is not technically correct, but leads to the desired forced checks for undefined `version` and `dataVersion`
  // Technically pg should infer that rows could have zero length, but adding optionality to all fields forces handling the undefined case when the row is empty
  const result = await client.query<{ version?: number }>(GetVersionSql);
  return result.rows[0]?.version ?? MigrationVersion.UNKNOWN;
}

export const getPostDeployVersion = async (client: Pool | PoolClient): Promise<number> => {
  const result = await client.query<{ dataVersion?: number }>(GetDataVersionSql);
  return result.rows[0]?.dataVersion ?? MigrationVersion.UNKNOWN;
};

export const markPostDeployMigrationCompleted = async (
  client: Pool | PoolClient,
  dataVersion: number,
  options?: {
    id: number;
  }
): Promise<number | undefined> => {
  assert(Number.isInteger(dataVersion));
  const latestVersion = getLatestPostDeployMigrationVersion();

  const id = options?.id ?? 1;

  // We do NOT want to update dataVersion if it is currently MigrationVersion.FIRST_BOOT,
  // i.e. "dataVersion" <> MigrationVersion.FIRST_BOOT
  // Except if we are attempting to update to the latest post-deploy version, i.e. newValue = latestVersion
  // Don't allow downgrading dataVersion, i.e. "dataVersion" < newValue
  const results = await client.query<{ id: number; version: number; dataVersion: number }>(
    'UPDATE "DatabaseMigration" SET "dataVersion" = $1::integer WHERE "id" = $2 AND ("dataVersion" <> $3 OR $1 = $4) AND "dataVersion" < $1::integer RETURNING *',
    [dataVersion, id, MigrationVersion.FIRST_BOOT, latestVersion]
  );

  return results.rows[0]?.dataVersion;
};
