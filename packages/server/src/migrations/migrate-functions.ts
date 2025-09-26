// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Client, escapeIdentifier, Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { SqlBuilder, UpdateQuery } from '../fhir/sql';
import { globalLogger } from '../logger';
import { getCheckConstraints } from './migrate';
import { getColumns } from './migrate-utils';
import { CheckConstraintDefinition, MigrationActionResult } from './types';

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
 * Adds a constraint to a table without blocking concurrent updates.
 * See {@link https://www.postgresql.org/docs/16/sql-altertable.html#SQL-ALTERTABLE-NOTES} for details.
 *
 * @param client - The database client or pool.
 * @param actions - The list of action results to push operations performed.
 * @param tableName - The name of the table to add the constraint to.
 * @param constraintName - The name of the constraint to add.
 * @param constraintExpression - The expression for the constraint.
 */
export async function nonBlockingAddCheckConstraint(
  client: Client | Pool | PoolClient,
  actions: MigrationActionResult[],
  tableName: string,
  constraintName: string,
  constraintExpression: string
): Promise<void> {
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

  const existing = await getExistingConstraint(client, tableName, constraintName);

  if (!existing) {
    // add constraint with NOT VALID to avoid a blocking full table scan
    await addCheckConstraint(client, actions, tableName, constraintName, constraintExpression, true);
  } else if (existing.valid) {
    // constraint is already valid, so nothing to do
    return;
  }

  // validate constraint; does not block updates to the table
  await query(
    client,
    actions,
    `ALTER TABLE ${escapeIdentifier(tableName)} VALIDATE CONSTRAINT ${escapeIdentifier(constraintName)}`
  );
}

async function getExistingConstraint(
  client: Client | Pool | PoolClient,
  tableName: string,
  constraintName: string
): Promise<CheckConstraintDefinition | undefined> {
  const constraints = await getCheckConstraints(client, tableName);
  return constraints.find((c) => c.name === constraintName);
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
  const columns = await getColumns(client, tableName);
  const column = columns.find((c) => c.name === columnName);
  if (!column) {
    throw new Error(`Column "${tableName}"."${columnName}" not found`);
  }

  if (column.notNull) {
    return;
  }

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

  await nonBlockingAddCheckConstraint(
    client,
    actions,
    tableName,
    constraintName,
    `${escapeIdentifier(columnName)} IS NOT NULL`
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

export function getCheckConstraintQuery(
  tableName: string,
  constraintName: string,
  constraintExpression: string,
  notValid: boolean
): string {
  return `ALTER TABLE ${escapeIdentifier(tableName)} ADD CONSTRAINT ${escapeIdentifier(constraintName)} CHECK (${constraintExpression})${notValid ? ' NOT VALID' : ''}`;
}

export async function addCheckConstraint(
  client: Client | Pool | PoolClient,
  actions: MigrationActionResult[],
  tableName: string,
  constraintName: string,
  constraintExpression: string,
  notValid: boolean
): Promise<void> {
  await query(client, actions, getCheckConstraintQuery(tableName, constraintName, constraintExpression, notValid));
}

/**
 * Updates rows in batches to avoid locking the table.
 * @param client - The database client or pool.
 * @param actions - The list of action results to push operations performed.
 * @param updateQuery - The update query to execute. The query must include a RETURNING clause and return no rows when there are no rows to update.
 * @param maxIterations - The maximum number of iterations to perform, Infinity is valid.
 */
export async function batchedUpdate(
  client: Client | Pool | PoolClient,
  actions: MigrationActionResult[],
  updateQuery: UpdateQuery,
  maxIterations: number
): Promise<void> {
  const start = Date.now();
  let rowCount: number | null = Infinity;
  const sql = new SqlBuilder();
  updateQuery.buildSql(sql);
  const updateQueryStr = sql.toString();
  const updateQueryValues = sql.getValues();
  if (!updateQuery.returning) {
    throw new Error('Update query for batchedUpdate must include a RETURNING clause');
  }

  let iterations = 0;
  while (rowCount !== null && rowCount > 0) {
    if (iterations >= maxIterations) {
      throw new Error(`Exceeded max iterations of ${maxIterations}`);
    }
    const result = await client.query(updateQueryStr, updateQueryValues);
    rowCount = result.rowCount;
    iterations++;
  }

  actions.push({ name: updateQueryStr, durationMs: Date.now() - start, iterations });
}
