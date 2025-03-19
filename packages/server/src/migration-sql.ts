import assert from 'assert';
import { Pool, PoolClient } from 'pg';
import { getLatestPostDeployMigrationVersion } from './migrations/migration-utils';

export const MigrationVersion = {
  /**
   * MigrationVersion.FIRST_BOOT
   *
   * When first running server, the post-deploy version (i.e. "DatabaseMigration"."dataVersion")
   * is initialized to MigrationVersion.FIRST_BOOT to facilitate
   * more graceful handling of interruptions to the process of running post-deploy migrations
   * and the fatal version checks that can potentially halt the server if the first boot
   * doesn't make it to the steadystate of having run all post-deploy migrations.
   *
   * While dataVersion is FIRST_BOOT, there are a couple differences in behavior:
   *
   * 1. The `requiredVersion` checks from the post-deploy manifest file are skipped. This is
   *    because the server (specifically in dev mode) is sensitive to restarts while still in the
   *    process of running post-deploy migrations since since it would be possible to get in
   *    a state where the current server version is greater than the `requiredVersion` of a
   *    post-deploy migration. Normally that causes server to refuse to start up, but not so in
   *    FIRST_BOOT mode.
   *
   * 2. The "DatabaseMigration"."dataVersion" column is not updated as each post-deploy
   *    migration is run until the last/latest post-deploy migration completes successfully.
   *    This is what keeps the server in FIRST_BOOT mode until all post-deploy
   *    migrations have completed successfully. See {@link markPostDeployMigrationCompleted}
   *    for more details.
   */
  FIRST_BOOT: -2,
  UNKNOWN: -1,
  NONE: 0,
} as const;

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
