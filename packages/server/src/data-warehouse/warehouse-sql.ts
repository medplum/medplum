// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { systemResourceProjectId } from '../constants';
import type { Expression } from '../fhir/sql';
import {
  Column,
  Condition,
  Conjunction,
  Constant,
  InsertQuery,
  Parameter,
  SelectQuery,
  SqlBuilder,
  SqlFunction,
} from '../fhir/sql';

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
export interface ManagedIcebergSetupOptions {
  s3Region: string;
  awsS3TableArn: string;
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
 * @returns SQL to run after `LOAD postgres` and DuckDB Postgres connection-limit settings.
 */
export function buildDuckdbPostgresAttachQuery(connectionString: string, alias = POSTGRES_CATALOG): string {
  const escapedConnectionString = connectionString.replaceAll("'", "''");
  return `ATTACH '${escapedConnectionString}' AS "${alias}" (TYPE postgres, READ_ONLY)`;
}

export function buildManagedIcebergQualifiedTable(namespace: string, icebergTable: string): string {
  return `${DEFAULT_ICEBERG_CATALOG_ALIAS}.${namespace}.${icebergTable}`;
}

/**
 * Reads the incremental sync watermark from Iceberg manifest column stats (no Parquet scan).
 *
 * Uses per-file `upper_bound` values from `iceberg_column_stats`.
 * Requires Iceberg V2+ tables with accurate `last_updated` bounds in manifest metadata.
 *
 * @param connection - DuckDB connection used to run the watermark query.
 * @param qualifiedIcebergTable - Fully qualified table name (e.g. `iceberg_catalog.default.patient_history`).
 * @returns The max `last_updated` upper bound, or `undefined` when the table is empty or has no stats.
 */
export async function fetchIcebergWatermark(
  connection: Pick<DuckdbConnection, 'prepare'>,
  qualifiedIcebergTable: string
): Promise<string | undefined> {
  // create the query
  const statsTableFn = new SqlFunction('iceberg_column_stats', [new Parameter(qualifiedIcebergTable)]);
  const watermarkColumn = new Column(undefined, 'max(try_cast(upper_bound AS TIMESTAMPTZ)) AS watermark', true);
  const filters = new Conjunction([
    new Condition('column_name', '=', 'last_updated'),
    new Condition('status', '!=', 'DELETED'),
    new Condition('upper_bound', '!=', null),
    new Condition('upper_bound', '!=', ''),
  ]);
  // NOTE: SelectQuery only supports table identifiers or subqueries in FROM, not table-valued
  //       functions like iceberg_column_stats(...), so we'll assemble this query with SqlBuilder directly.
  const query = buildSqlBuilder((sql) => {
    sql.append('SELECT ');
    sql.appendColumn(watermarkColumn);
    sql.append(' FROM ');
    sql.appendExpression(statsTableFn);
    sql.append(' WHERE ');
    sql.appendExpression(filters);
  });

  // execute it
  const result = await runParameterizedWarehouseSqlReadAll(connection, query);
  const row = result.getRowObjectsJson()[0] as { watermark?: string | null } | undefined;
  return row?.watermark ?? undefined;
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
 * Constructs a SQL `SELECT` query from a Medplum history Postgres table and extracts the project_id
 * using DuckDB's JSON functionality. This minimizes the load on the source database.
 *
 * When `meta.project` is absent from history JSON (protected resources, server-scoped User/Subscription,
 * system-repo creates, delete tombstones, legacy rows), falls back to {@link systemResourceProjectId}
 * to match main-table `projectId` and `_project:missing` search semantics.
 *
 * @param sourceHistoryTable - Postgres table identifier exactly as stored (e.g. `Patient_History`).
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

  // DuckDB JSON extract + COALESCE; SelectQuery columns are Column-only, so render SqlFunction then attach alias.
  const projectIdExpr = new SqlFunction('COALESCE', [
    new SqlFunction('json_extract_string', [
      new Constant('"src"."content"::JSON'),
      new Constant(`'${PROJECT_ID_JSON_PATH}'`),
    ]),
    new Constant(`'${systemResourceProjectId}'`),
  ]);
  const projectIdSql = new SqlBuilder();
  projectIdSql.appendExpression(projectIdExpr);

  return new SelectQuery('src', inner)
    .column('id')
    .column('version_id')
    .column('content')
    .column('last_updated')
    .column(new Column(undefined, projectIdSql.toString(), true, 'project_id'));
}

export function buildProjectedSelectFromHistoryTable(
  sourceHistoryTable: string,
  sourcePredicate?: Expression
): SqlBuilder {
  return buildSqlBuilder((sql) =>
    sql.appendExpression(buildSelectFromHistoryTableQuery(sourceHistoryTable, sourcePredicate))
  );
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
 * DuckDB instance setup for managed Iceberg (extensions, S3 secret, S3 Tables attach).
 *
 * Run once per DuckDB instance. Session settings belong in
 * `S3TablesWarehouseDestination.getConnectionSetupQueries` and must run on every connection.
 *
 * @param options - Attach options; requires `awsS3TableArn` and `s3Region`.
 * @returns SQL strings to run once on the DuckDB instance before opening work connections.
 */
export function buildManagedIcebergSetupQueries(options: ManagedIcebergSetupOptions): string[] {
  return [
    ...buildManagedIcebergExtensionQueries(),
    buildManagedS3CredentialSecretQuery(options.s3Region),
    buildManagedS3TablesIcebergAttachQuery(options.awsS3TableArn),
  ];
}
