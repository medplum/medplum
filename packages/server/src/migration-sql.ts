// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import assert from 'assert';
import { Pool, PoolClient, QueryResult } from 'pg';
import { getLatestPostDeployMigrationVersion, MigrationVersion } from './migrations/migration-versions';

// These are exported for the sake of intercepting and mocking in tests
export const GetVersionSql = 'SELECT "version" FROM "DatabaseMigration" WHERE "id" = 1';
export const GetDataVersionSql = 'SELECT "dataVersion", "firstBoot" FROM "DatabaseMigration" WHERE "id" = 1';

// The rowId parameterized version is not exported and should only be used in tests
const GetDataVersionSqlWithRowId = 'SELECT "dataVersion", "firstBoot" FROM "DatabaseMigration" WHERE "id" = $1';

export async function getPreDeployVersion(client: Pool | PoolClient): Promise<number> {
  // This generic type is not technically correct, but leads to the desired forced checks for undefined `version` and `dataVersion`
  // Technically pg should infer that rows could have zero length, but adding optionality to all fields forces handling the undefined case when the row is empty
  const result = await client.query<{ version?: number }>(GetVersionSql);
  return result.rows[0]?.version ?? MigrationVersion.UNKNOWN;
}

export const getPostDeployVersion = async (
  client: Pool | PoolClient,
  options?: { ignoreFirstBoot?: boolean; rowId?: number }
): Promise<number> => {
  const rowId = options?.rowId ?? 1;

  let result: QueryResult<{ dataVersion?: number; firstBoot?: boolean }>;
  // This if/else is here since some SQL queries are mocked based on the exact query string in tests
  if (rowId === 1) {
    result = await client.query<{ dataVersion?: number; firstBoot?: boolean }>(GetDataVersionSql);
  } else {
    result = await client.query<{ dataVersion?: number; firstBoot?: boolean }>(GetDataVersionSqlWithRowId, [rowId]);
  }

  const { dataVersion, firstBoot } = result.rows[0] ?? {};
  if (dataVersion === undefined) {
    return MigrationVersion.UNKNOWN;
  }

  return !options?.ignoreFirstBoot && firstBoot ? MigrationVersion.FIRST_BOOT : dataVersion;
};

export const markPostDeployMigrationCompleted = async (
  client: Pool | PoolClient,
  dataVersion: number,
  options?: {
    rowId?: number;
  }
): Promise<number | undefined> => {
  assert(Number.isInteger(dataVersion));
  const latestVersion = getLatestPostDeployMigrationVersion();

  const rowId = options?.rowId ?? 1;

  // If not in firstBoot mode, you cannot re-enter firstBoot mode
  // If in firstBoot mode, stay there unless the new dataVersion === latestVersion
  // Don't allow downgrading dataVersion, i.e. "dataVersion" < newValue
  const results = await client.query<{ id: number; version: number; dataVersion: number }>(
    'UPDATE "DatabaseMigration" SET "dataVersion" = $1::integer, "firstBoot" = ("firstBoot" AND ($1::integer < $3::integer)) WHERE "id" = $2 AND "dataVersion" < $1::integer RETURNING *',
    [dataVersion, rowId, latestVersion]
  );

  return results.rows[0]?.dataVersion;
};
