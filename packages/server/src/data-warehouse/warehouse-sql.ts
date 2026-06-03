// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Expression } from '../fhir/sql';
import { Column, Condition, Disjunction, InsertQuery, IsNull, SelectQuery, SqlBuilder, Subquery } from '../fhir/sql';

const DEFAULT_COMPRESSION_TYPE = 'zstd';
const DEFAULT_FILE_FORMAT = 'PARQUET';

/** Default Iceberg catalog schema for warehouse objects. */
export const DEFAULT_NAMESPACE = 'default';

/** DuckDB catalog alias for attached S3 Tables Iceberg; not a Postgres schema/catalog name. */
export const DEFAULT_ICEBERG_CATALOG_ALIAS = 'iceberg_catalog';

/** DuckDB catalog alias for attached Postgres source tables. */
export const POSTGRES_CATALOG = 'pg_db';

/** the path to the project id in the content JSON */
export const PROJECT_ID_JSON_PATH = '$.meta.project';

/** Iceberg / Parquet column names written for each resource history row (order matters for INSERT). */
export const WAREHOUSE_HISTORY_COLUMN_NAMES = ['id', 'version_id', 'content', 'last_updated', 'project_id'] as const;

/** Options required to build managed Iceberg attach/setup SQL (extensions, secrets, attach). */
export interface ManagedIcebergAttachOptions {
  connectionString: string;
  s3Region: string;
  awsS3TableArn: string;
  namespace?: string;
}

export interface DuckdbMaterializedResult {
  /** Rows in the result set (often 1 for INSERT/COPY completion metadata). */
  rowCount: number;
  /** Rows inserted/updated/deleted by the statement. */
  rowsChanged: number;
}

export interface DuckdbPreparedStatement {
  bindValue(index: number, value: unknown): void;
  run(): Promise<DuckdbMaterializedResult>;
  runAndReadAll(): Promise<{ getRowObjectsJson(): unknown[] }>;
}

export interface DuckdbConnection {
  run(query: string): Promise<unknown>;
  prepare(sql: string): Promise<DuckdbPreparedStatement>;
}

function buildSqlBuilder(buildFn: (sql: SqlBuilder) => void): SqlBuilder {
  const sql = new SqlBuilder();
  buildFn(sql);
  return sql;
}

/**
 * Lower bound on Postgres history `lastUpdated` for warehouse export.
 *
 * @param startDate - Lower bound on history `lastUpdated` (validated by config before sync runs).
 * @returns A SQL boolean expression for the lower bound on Postgres history `lastUpdated` for warehouse export.
 */
export function buildStartDatePredicate(startDate: string): Expression {
  return new Condition('lastUpdated', '>=', startDate);
}

export async function runParameterizedWarehouseSql(
  connection: Pick<DuckdbConnection, 'prepare'>,
  query: SqlBuilder
): Promise<number> {
  const statement = await connection.prepare(query.toString());
  const values = query.getValues();
  for (let i = 0; i < values.length; i++) {
    statement.bindValue(i + 1, values[i]);
  }
  const result = await statement.run();
  return result.rowsChanged;
}

export async function runParameterizedWarehouseSqlReadAll(
  connection: Pick<DuckdbConnection, 'prepare'>,
  query: SqlBuilder
): Promise<{ getRowObjectsJson(): unknown[] }> {
  const statement = await connection.prepare(query.toString());
  const values = query.getValues();
  for (let i = 0; i < values.length; i++) {
    statement.bindValue(i + 1, values[i]);
  }
  return statement.runAndReadAll();
}

function getQualifiedTableIdentifierParts(qualifiedTable: string, minParts = 1): string[] {
  const parts = qualifiedTable.split('.');
  if (parts.length < minParts || parts.some((part) => !part)) {
    throw new Error(`Invalid qualified table identifier: ${qualifiedTable}`);
  }
  return parts;
}

function buildQualifiedTableIdentifier(qualifiedTable: string, minParts = 1): string {
  return getQualifiedTableIdentifierParts(qualifiedTable, minParts).join('"."');
}

/**
 * DuckDB `ATTACH` for a PostgreSQL server (postgres extension), using the same alias as other data-warehouse DuckDB flows (`pg_db`).
 *
 * @param connectionString - PostgreSQL connection URI or libpq keyword/value string (including `options` for session GUCs such as `statement_timeout`).
 * @param alias - Unquoted DuckDB catalog name (default `pg_db`).
 * @returns SQL to run after `INSTALL postgres` and `LOAD postgres`.
 */
export function buildDuckdbPostgresAttachQuery(connectionString: string, alias = POSTGRES_CATALOG): string {
  const escapedConnectionString = connectionString.replaceAll("'", "''");
  return `ATTACH '${escapedConnectionString}' AS "${alias}" (TYPE postgres, READ_ONLY)`;
}

export function buildManagedIcebergQualifiedTable(namespace: string, icebergTable: string): string {
  return `${DEFAULT_ICEBERG_CATALOG_ALIAS}.${namespace}.${icebergTable}`;
}

export function buildInsertIntoSelectQuery(
  qualifiedTable: string,
  selectQuery: SelectQuery,
  insertColumns: string[] = [...WAREHOUSE_HISTORY_COLUMN_NAMES]
): SqlBuilder {
  const safeQualifiedTableName = buildQualifiedTableIdentifier(qualifiedTable);
  const query = new InsertQuery(safeQualifiedTableName, selectQuery, insertColumns);
  return buildSqlBuilder((sql) => {
    sql.appendExpression(query);
  });
}

/**
 * Constructs a SQL `SELECT` query from a Medplum history Postgres table and extracts the project_id.
 * using the DuckDB's JSON functionality.  This minimizes the load on the source database.
 *
 * @param sourceHistoryTable - Postgres table identifier exactly as stored (e.g. `Patient_history` or `Patient_History`).
 * @param sourcePredicate - Optional SQL boolean expression (joined with `AND` after non-empty content filter).
 * @returns `SELECT` with a subquery and outer `json_extract_string` projection.
 */
export function buildSelectFromHistoryTableQuery(
  sourceHistoryTable: string,
  sourcePredicate?: Expression
): SelectQuery {
  const table = buildQualifiedTableIdentifier(`${POSTGRES_CATALOG}.${sourceHistoryTable}`);
  const col = (name: string, alias?: string): Column => new Column(table, name, false, alias);

  const inner = new SelectQuery(table)
    .column('id')
    .column(col('versionId', 'version_id'))
    .column('content')
    .column(col('lastUpdated', 'last_updated'))
    .where('content', '!=', null)
    .where('content', '!=', '');
  if (sourcePredicate) {
    inner.whereExpr(sourcePredicate);
  }
  inner.orderBy('lastUpdated');

  return new SelectQuery('src', inner)
    .column('id')
    .column('version_id')
    .column('content')
    .column('last_updated')
    .raw(`json_extract_string("src"."content"::JSON, '${PROJECT_ID_JSON_PATH}') AS project_id`);
}

export function buildProjectedSelectFromHistoryTable(
  sourceHistoryTable: string,
  sourcePredicate?: Expression
): SqlBuilder {
  return buildSqlBuilder((sql) =>
    sql.appendExpression(buildSelectFromHistoryTableQuery(sourceHistoryTable, sourcePredicate))
  );
}

export function buildCountFromHistoryTableQuery(sourceHistoryTable: string, sourcePredicate?: Expression): SqlBuilder {
  const table = buildQualifiedTableIdentifier(`${POSTGRES_CATALOG}.${sourceHistoryTable}`);
  const query = new SelectQuery(table).raw('COUNT(*) AS count').where('content', '!=', null).where('content', '!=', '');
  if (sourcePredicate) {
    query.whereExpr(sourcePredicate);
  }

  return buildSqlBuilder((sql) => {
    sql.appendExpression(query);
  });
}

/**
 * Constructs a SQL predicate for selecting rows with a "lastUpdated" value greater than the current high-watermark.
 *
 * This predicate is used for incremental syncs, ensuring only new rows are considered. The query is intentionally written as
 *   (MAX(last_updated)) IS NULL OR lastUpdated > (MAX(last_updated))
 * and not just lastUpdated > (MAX(...)), for the following reasons:
 *
 * 1. The target table may be empty. In this case, MAX(last_updated) returns NULL. SQL `NULL > value` is unknown (not true!),
 *    so we must explicitly check for the NULL case. Only by adding IS NULL do we guarantee that when the table is empty,
 *    the predicate evaluates as true for all source rows.
 *
 * 2. DuckDB and Postgres strictly follow SQL three-valued logic; without this clause, no rows would be selected if there
 *    is not yet a high-watermark value.
 *
 * 3. Users may set up a table with no prior sync artifacts, and in that case, we need to ensure the initial sync (bootstrap)
 *    includes all data.
 *
 * @param qualifiedTable - Fully qualified table name (may include schema, etc.)
 * @returns SQL boolean expression for use in WHERE clauses to filter records for incremental sync based on lastUpdated.
 */
export function buildMaxLastUpdatedWatermarkPredicate(qualifiedTable: string): Expression {
  const safeQualifiedTableName = buildQualifiedTableIdentifier(qualifiedTable, 2);
  const maxLastUpdatedSubquery = new SelectQuery(safeQualifiedTableName).raw('MAX(last_updated)');

  return new Disjunction([
    new IsNull(new Subquery(maxLastUpdatedSubquery)),
    new Condition('lastUpdated', '>', new Subquery(maxLastUpdatedSubquery)),
  ]);
}

export function buildCopySelectToParquetQuery(selectQuery: SqlBuilder, parquetPath: string): SqlBuilder {
  // escape path so it can contain single quotes
  const escapedParquetPath = parquetPath.replaceAll("'", "''");
  const sql = new SqlBuilder();
  sql.append('COPY (');
  sql.appendSql(selectQuery);
  sql.append(`) TO '${escapedParquetPath}' (FORMAT ${DEFAULT_FILE_FORMAT}, COMPRESSION ${DEFAULT_COMPRESSION_TYPE})`);
  return sql;
}

/**
 * `INSTALL` / `LOAD` lines for the managed Iceberg / S3 Tables DuckDB stack (extensions used by {@link buildManagedIcebergSetupQueries}).
 *
 * @see https://duckdb.org/docs/current/core_extensions/postgres
 * @returns SQL statements in execution order.
 */
export function buildManagedIcebergExtensionQueries(): string[] {
  return [
    `INSTALL aws`,
    `LOAD aws`,
    `INSTALL postgres`,
    `LOAD postgres`,
    `INSTALL httpfs`,
    `LOAD httpfs`,
    `INSTALL iceberg`,
    `LOAD iceberg`,
  ];
}

/**
 * DuckDB default secret for S3-backed Iceberg (managed S3 Tables path).
 * @see https://duckdb.org/docs/current/core_extensions/postgres
 * @see https://duckdb.org/docs/current/core_extensions/aws#credential_chain-provider
 *
 * @param s3Region - AWS region passed to the secret.
 * @returns Single `CREATE SECRET` statement.
 */
export function buildManagedS3CredentialSecretQuery(s3Region: string): string {
  return `CREATE SECRET ( TYPE S3, PROVIDER CREDENTIAL_CHAIN, REGION '${s3Region}' )`;
}

/**
 * DuckDB `ATTACH` for AWS S3 Tables as the `s3_tables_db` Iceberg catalog.
 *
 * @see https://duckdb.org/docs/current/core_extensions/iceberg/amazon_s3_tables
 * @param awsS3TableArn - S3 Tables bucket ARN.
 * @returns Single `ATTACH` statement.
 */
export function buildManagedS3TablesIcebergAttachQuery(awsS3TableArn: string): string {
  return `ATTACH '${awsS3TableArn}' AS "${DEFAULT_ICEBERG_CATALOG_ALIAS}" ( TYPE iceberg, ENDPOINT_TYPE s3_tables )`;
}

/**
 * DuckDB setup for managed Iceberg (extensions, S3 secret, Postgres attach, S3 Tables attach).
 *
 * @param options - Attach options; requires `awsS3TableArn` and `s3Region`.
 * @returns SQL strings to run in order before per-table mutations.
 */
export function buildManagedIcebergSetupQueries(options: ManagedIcebergAttachOptions): string[] {
  const queries: string[] = [...buildManagedIcebergExtensionQueries()];

  queries.push(buildManagedS3CredentialSecretQuery(options.s3Region));
  queries.push(buildDuckdbPostgresAttachQuery(options.connectionString));
  queries.push(buildManagedS3TablesIcebergAttachQuery(options.awsS3TableArn));

  return queries;
}
