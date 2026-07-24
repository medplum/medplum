// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** Integration: Postgres history row → DuckDB INSERT with subquery-projected json_extract_string. */

import { DuckDBInstance } from '@duckdb/node-api';
import pg from 'pg';
import { loadTestConfig } from '../config/loader';
import { SqlBuilder } from '../fhir/sql';
import { buildPgConnectionURI } from './config';
import type { DuckdbConnection } from './warehouse-sql';
import {
  buildDuckdbPostgresAttachQuery,
  buildInsertIntoSelectQuery,
  buildSelectFromHistoryTableQuery,
  fetchIcebergWatermark,
  runParameterizedWarehouseSql,
  runParameterizedWarehouseSqlReadAll,
} from './warehouse-sql';

const PATIENT_HISTORY_TABLE = 'iceberg_catalog.default.patient_history';
const DELETED_ONLY_TABLE = 'iceberg_catalog.default.deleted_only';

const HISTORY_TABLE = 'DwWarehouseSqlIntTest_history';
const DEST_TABLE = 'wh_sql_int_dest';

const PATIENT_ID = '6e586f88-710f-42b2-9cc2-285496264c99';
const VERSION_ID = 'c227e03f-b6d5-44f7-b191-8571ed508d7e';
const PROJECT_ID = '71b6dae7-1e96-47ed-babb-c1a0e58a885f';

describe('warehouse SQL (integration)', () => {
  let host: string;
  let port: number;
  let database: string;
  let username: string;
  let password: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    const db = config.database;
    host = db.host ?? '';
    port = db.port ?? 5432;
    database = db.dbname ?? '';
    username = db.username ?? '';
    password = db.password ?? '';

    const client = new pg.Client({ host, port, database, user: username, password });
    await client.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS "${HISTORY_TABLE}"`);
      await client.query(`
        CREATE TABLE "${HISTORY_TABLE}" (
          id UUID NOT NULL,
          "versionId" UUID NOT NULL,
          content TEXT NOT NULL,
          "lastUpdated" TIMESTAMPTZ NOT NULL
        );
      `);
      await client.query(
        `INSERT INTO "${HISTORY_TABLE}" (id, "versionId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
        [
          PATIENT_ID,
          VERSION_ID,
          JSON.stringify({
            resourceType: 'Patient',
            id: PATIENT_ID,
            meta: { project: PROJECT_ID },
          }),
          '2024-06-01T12:00:00.000Z',
        ]
      );
    } finally {
      await client.end();
    }
  }, 10_000);

  afterAll(async () => {
    const client = new pg.Client({ host, port, database, user: username, password });
    await client.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS "${HISTORY_TABLE}"`);
    } finally {
      await client.end();
    }
  }, 10_000);

  test('INSERT INTO with subquery projection extracts project_id via DuckDB json_extract_string', async () => {
    const connStr = buildPgConnectionURI({ host, port, dbname: database, username, password });
    const projectedSelect = buildSelectFromHistoryTableQuery(HISTORY_TABLE);
    const insertQuery = buildInsertIntoSelectQuery(`main.${DEST_TABLE}`, projectedSelect);

    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await connection.run('INSTALL postgres; LOAD postgres;');
      await connection.run('SET threads = 1');
      await connection.run('SET pg_use_ctid_scan = false');
      await connection.run(buildDuckdbPostgresAttachQuery(connStr));
      await connection.run(`
        CREATE TABLE "${DEST_TABLE}" (
          id UUID,
          version_id UUID,
          content VARCHAR,
          last_updated TIMESTAMPTZ,
          project_id UUID
        );
      `);

      const rowCount = await runParameterizedWarehouseSql(connection, insertQuery);
      expect(rowCount).toBe(1);

      const readSql = new SqlBuilder();
      readSql.append(`SELECT id, project_id FROM "${DEST_TABLE}"`);
      const readResult = await runParameterizedWarehouseSqlReadAll(connection, readSql);
      const row = readResult.getRowObjectsJson()[0] as { id: string; project_id: string };
      expect(row.id).toBe(PATIENT_ID);
      expect(row.project_id).toBe(PROJECT_ID);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }, 30_000);

  test('fetchIcebergWatermark executes parameterized iceberg_column_stats against DuckDB', async () => {
    // given
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await setupFakeIcebergColumnStats(connection);

      // when
      const watermark = await fetchIcebergWatermark(connection, PATIENT_HISTORY_TABLE);
      // then
      expect(watermark).toBeDefined();
      expect(new Date(watermark as string).toISOString()).toBe('2024-07-15T08:30:00.000Z');
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });

  test('fetchIcebergWatermark returns undefined when table has no manifest stats', async () => {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await setupFakeIcebergColumnStats(connection);

      const watermark = await fetchIcebergWatermark(connection, 'iceberg_catalog.default.empty_table');
      expect(watermark).toBeUndefined();
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });

  test('fetchIcebergWatermark ignores DELETED status and empty upper_bound rows', async () => {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await setupFakeIcebergColumnStats(connection);

      const watermark = await fetchIcebergWatermark(connection, DELETED_ONLY_TABLE);
      expect(watermark).toBeUndefined();
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });
});

/**
 * Stand-in for the Iceberg extension's `iceberg_column_stats` table function.
 * @param connection - The DuckDB connection to use.
 * @returns A promise that resolves when the fake iceberg_column_stats table function is set up.
 */
async function setupFakeIcebergColumnStats(connection: DuckdbConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE iceberg_column_stats_fixture (
      table_name VARCHAR,
      column_name VARCHAR,
      status VARCHAR,
      upper_bound VARCHAR
    );
  `);
  await connection.run(`
    INSERT INTO iceberg_column_stats_fixture VALUES
      ('${PATIENT_HISTORY_TABLE}', 'last_updated', 'ADDED', '2024-06-01T12:00:00.000Z'),
      ('${PATIENT_HISTORY_TABLE}', 'last_updated', 'ADDED', '2024-07-15T08:30:00.000Z'),
      ('${PATIENT_HISTORY_TABLE}', 'last_updated', 'DELETED', '2024-08-01T00:00:00.000Z'),
      ('${PATIENT_HISTORY_TABLE}', 'last_updated', 'ADDED', ''),
      ('${PATIENT_HISTORY_TABLE}', 'id', 'ADDED', '999'),
      ('iceberg_catalog.default.other_table', 'last_updated', 'ADDED', '2024-12-01T00:00:00.000Z'),
      ('${DELETED_ONLY_TABLE}', 'last_updated', 'DELETED', '2024-08-01T00:00:00.000Z'),
      ('${DELETED_ONLY_TABLE}', 'last_updated', 'ADDED', '');
  `);
  await connection.run(`
    CREATE OR REPLACE MACRO iceberg_column_stats(qualified_table) AS TABLE
    SELECT column_name, status, upper_bound
    FROM iceberg_column_stats_fixture f
    WHERE f.table_name = qualified_table;
  `);
}
