// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Client, escapeIdentifier, Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { globalLogger } from '../logger';
import { MigrationActionResult } from './types';

export async function query<R extends QueryResultRow = any>(
  client: Client | Pool | PoolClient,
  results: MigrationActionResult[],
  queryStr: string,
  params?: any[]
): Promise<QueryResult<R>> {
  const start = Date.now();
  const result = await client.query<R>(queryStr, params);
  results.push({ name: queryStr, durationMs: Date.now() - start });
  return result;
}

/**
 * Creates an index if it does not exist. If the index exists but is invalid, it will be dropped and recreated.
 * If the index exists and is valid, no action will be taken. This function is useful to recover from
 * failed concurrent index creation attempts, e.g. a post-deploy migration in the middle of creating a large
 * index that could take many minutes to complete is interrupted due to a server deployment or the worker
 * performing the migration is interrupted/crashes for any other reason.
 *
 * @param client - The database client or pool.
 * @param results - The list of action results to push operations performed.
 * @param indexName - The name of the index to create.
 * @param createIndexSql - The SQL to create the index.
 */
export async function idempotentCreateIndex(
  client: Client | Pool | PoolClient,
  results: MigrationActionResult[],
  indexName: string,
  createIndexSql: string
): Promise<void> {
  const existsResult = await client.query<{
    exists: boolean;
    is_valid: boolean;
  }>(
    `SELECT 
       EXISTS(SELECT 1 FROM pg_class WHERE relname = $1) AS exists,
       EXISTS(SELECT 1 
           FROM pg_index idx 
           JOIN pg_class i ON i.oid = idx.indexrelid 
           WHERE i.relname = $1 AND idx.indisvalid
       ) AS is_valid`,
    [indexName]
  );
  const { is_valid } = existsResult.rows[0];
  let exists = existsResult.rows[0].exists;

  // Drop index if it is not valid
  if (exists && !is_valid) {
    const start = Date.now();
    const dropQuery = `DROP INDEX IF EXISTS ${escapeIdentifier(indexName)}`;
    await client.query(dropQuery);
    const durationMs = Date.now() - start;
    globalLogger.debug('Dropped invalid index', { indexName, durationMs });
    results.push({ name: dropQuery, durationMs });
    exists = false;
  }

  // create index if it doesn't exist
  if (!exists) {
    const start = Date.now();
    await client.query(createIndexSql);
    const durationMs = Date.now() - start;
    globalLogger.debug('Created index', { indexName, durationMs });
    results.push({ name: createIndexSql, durationMs });
  }
}

export async function analyzeTable(
  client: Client | Pool | PoolClient,
  actions: MigrationActionResult[],
  tableName: string
): Promise<void> {
  const start = Date.now();
  const analyzeQuery = `ANALYZE ${escapeIdentifier(tableName)}`;
  await client.query(analyzeQuery);
  const durationMs = Date.now() - start;
  globalLogger.debug('Analyzed table', { tableName, durationMs });
  actions.push({ name: analyzeQuery, durationMs });
}

/**
 * Non-blocking alter column NOT NULL utilizing a temporary table constraint. Throws if any rows contain NULL values.
 * See {@link https://www.postgresql.org/docs/16/sql-altertable.html#SQL-ALTERTABLE-NOTES} for details.
 *
 * @param client - The database client or pool.
 * @param actions - The list of action results to push operations performed.
 * @param tableName - The name of the table to analyze.
 * @param columnName - The name of the column to analyze.
 */
export async function nonBlockingAlterColumnNotNull(
  client: Client | Pool | PoolClient,
  actions: MigrationActionResult[],
  tableName: string,
  columnName: string
): Promise<void> {
  const nullCountResult = await query<{ count: number }>(
    client,
    actions,
    `SELECT COUNT(*) FROM ${escapeIdentifier(tableName)} WHERE ${escapeIdentifier(columnName)} IS NULL`
  );
  const nullCount = nullCountResult.rows[0].count;
  if (nullCount > 0) {
    throw new Error(
      `Cannot alter "${tableName}"."${columnName}" to NOT NULL because there are ${nullCount} rows with NULL values`
    );
  }

  const constraintName = `${tableName}_${columnName}_not_null`;

  /*
  Scanning a large table to verify a new foreign key or check constraint can take a long time, and other updates to
  the table are locked out until the ALTER TABLE ADD CONSTRAINT command is committed. The main purpose of the
  NOT VALID constraint option is to reduce the impact of adding a constraint on concurrent updates. With NOT VALID,
  the ADD CONSTRAINT command does not scan the table and can be committed immediately. After that, a VALIDATE CONSTRAINT
  command can be issued to verify that existing rows satisfy the constraint. The validation step does not need to lock
  out concurrent updates, since it knows that other transactions will be enforcing the constraint for rows that they
  insert or update; only pre-existing rows need to be checked. Hence, validation acquires only a SHARE UPDATE EXCLUSIVE
  lock on the table being altered. (If the constraint is a foreign key then a ROW SHARE lock is also required on the
  table referenced by the constraint.) In addition to improving concurrency, it can be useful to use NOT VALID and
  VALIDATE CONSTRAINT in cases where the table is known to contain pre-existing violations. Once the constraint is in
  place, no new violations can be inserted, and the existing problems can be corrected at leisure until
  VALIDATE CONSTRAINT finally succeeds.
  */

  // add constraint with NOT VALID to avoid a blocking full table scan
  await addConstraint(client, actions, tableName, constraintName, `${escapeIdentifier(columnName)} IS NOT NULL`, true);

  // validate constraint; does not block updates to the table
  await query(
    client,
    actions,
    `ALTER TABLE ${escapeIdentifier(tableName)} VALIDATE CONSTRAINT ${escapeIdentifier(constraintName)}`
  );

  // set column to NOT NULL; uses the constraint instead of a full table scan
  await query(
    client,
    actions,
    `ALTER TABLE ${escapeIdentifier(tableName)} ALTER COLUMN ${escapeIdentifier(columnName)} SET NOT NULL`
  );

  // drop redundant constraint
  await query(
    client,
    actions,
    `ALTER TABLE ${escapeIdentifier(tableName)} DROP CONSTRAINT ${escapeIdentifier(constraintName)}`
  );
}

export async function addConstraint(
  client: Client | Pool | PoolClient,
  actions: MigrationActionResult[],
  tableName: string,
  constraintName: string,
  constraintExpression: string,
  notValid?: boolean
): Promise<void> {
  await query(
    client,
    actions,
    `ALTER TABLE ${escapeIdentifier(tableName)} ADD CONSTRAINT ${escapeIdentifier(constraintName)} CHECK (${constraintExpression})${notValid ? ' NOT VALID' : ''}`
  );
}
