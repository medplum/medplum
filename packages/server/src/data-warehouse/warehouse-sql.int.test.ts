// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** Integration: Postgres history row joined to resource table for project_id projection. */

import { DuckDBInstance } from '@duckdb/node-api';
import pg from 'pg';
import { loadTestConfig } from '../config/loader';
import { Conjunction, SqlBuilder } from '../fhir/sql';
import { buildPgConnectionURI } from './config';
import {
  buildDuckdbPostgresAttachQuery,
  buildInsertIntoSelectQuery,
  buildMaxLastUpdatedWatermarkPredicate,
  buildSelectFromHistoryTableQuery,
  buildStartDatePredicate,
  runParameterizedWarehouseSql,
  runParameterizedWarehouseSqlReadAll,
} from './warehouse-sql';

const RESOURCE_TABLE = 'DwWarehouseSqlIntTestPatient';
const HISTORY_TABLE = 'DwWarehouseSqlIntTestPatient_History';
const DEST_TABLE = 'wh_sql_int_dest';

const HISTORY_ROW_V1 = {
  id: 'patient-wh-sql-1',
  versionId: '1',
  lastUpdated: '2024-06-01T12:00:00.000Z',
  content: JSON.stringify({
    resourceType: 'Patient',
    id: 'patient-wh-sql-1',
    meta: { project: 'project-from-json' },
  }),
};

const HISTORY_ROW_V2 = {
  id: 'patient-wh-sql-1',
  versionId: '2',
  lastUpdated: '2024-06-02T12:00:00.000Z',
  content: JSON.stringify({
    resourceType: 'Patient',
    id: 'patient-wh-sql-1',
    meta: { project: 'project-from-json', versionId: '2' },
  }),
};

async function createDestTable(connection: { run(query: string): Promise<unknown> }, tableName: string): Promise<void> {
  await connection.run(`
    CREATE TABLE "${tableName}" (
      id VARCHAR,
      version_id VARCHAR,
      content VARCHAR,
      last_updated TIMESTAMPTZ,
      project_id VARCHAR
    );
  `);
}

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
      await client.query(`DROP TABLE IF EXISTS "${RESOURCE_TABLE}"`);
      await client.query(`
        CREATE TABLE "${RESOURCE_TABLE}" (
          id TEXT NOT NULL PRIMARY KEY,
          "projectId" TEXT NOT NULL,
          content TEXT NOT NULL,
          "lastUpdated" TIMESTAMPTZ NOT NULL
        );
      `);
      await client.query(`
        CREATE TABLE "${HISTORY_TABLE}" (
          id TEXT NOT NULL,
          "versionId" TEXT NOT NULL,
          content TEXT NOT NULL,
          "lastUpdated" TIMESTAMPTZ NOT NULL
        );
      `);
      await client.query(
        `INSERT INTO "${RESOURCE_TABLE}" (id, "projectId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
        [
          'patient-wh-sql-1',
          'project-from-resource',
          JSON.stringify({
            resourceType: 'Patient',
            id: 'patient-wh-sql-1',
            meta: { project: 'project-from-json' },
          }),
          '2024-06-01T12:00:00.000Z',
        ]
      );
      await client.query(
        `INSERT INTO "${HISTORY_TABLE}" (id, "versionId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
        [
          'patient-wh-sql-1',
          '1',
          JSON.stringify({
            resourceType: 'Patient',
            id: 'patient-wh-sql-1',
            meta: { project: 'project-from-json' },
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
      await client.query(`DROP TABLE IF EXISTS "${RESOURCE_TABLE}"`);
    } finally {
      await client.end();
    }
  }, 10_000);

  test('INSERT INTO with joined resource table projects project_id from projectId column', async () => {
    // Given: a projected history select joined to the live resource table
    const connStr = buildPgConnectionURI({ host, port, dbname: database, username, password });
    const projectedSelect = buildSelectFromHistoryTableQuery(HISTORY_TABLE);
    const insertQuery = buildInsertIntoSelectQuery(`main.${DEST_TABLE}`, projectedSelect);

    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await connection.run('INSTALL postgres; LOAD postgres;');
      await connection.run(buildDuckdbPostgresAttachQuery(connStr));
      await createDestTable(connection, DEST_TABLE);

      // When: DuckDB inserts the projected row into the destination table
      const rowCount = await runParameterizedWarehouseSql(connection, insertQuery);

      // Then: one row is written
      expect(rowCount).toBe(1);

      // Then: project_id comes from the joined resource table, not the history JSON
      const readSql = new SqlBuilder();
      readSql.append(`SELECT id, project_id FROM "${DEST_TABLE}"`);
      const readResult = await runParameterizedWarehouseSqlReadAll(connection, readSql);
      const row = readResult.getRowObjectsJson()[0] as { id: string; project_id: string };
      expect(row.id).toBe('patient-wh-sql-1');
      expect(row.project_id).toBe('project-from-resource');
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }, 30_000);

  test('INSERT INTO with watermark predicate on empty destination bootstraps joined rows', async () => {
    // Given: an empty destination and a watermark predicate over the joined history select
    const destTable = 'wh_sql_int_watermark_empty';
    const connStr = buildPgConnectionURI({ host, port, dbname: database, username, password });
    const watermarkPredicate = buildMaxLastUpdatedWatermarkPredicate(`main.${destTable}`, HISTORY_TABLE);
    const projectedSelect = buildSelectFromHistoryTableQuery(HISTORY_TABLE, watermarkPredicate);
    const insertQuery = buildInsertIntoSelectQuery(`main.${destTable}`, projectedSelect);

    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await connection.run('INSTALL postgres; LOAD postgres;');
      await connection.run(buildDuckdbPostgresAttachQuery(connStr));
      await createDestTable(connection, destTable);

      // When: DuckDB runs the incremental insert against an empty high-water mark
      const rowCount = await runParameterizedWarehouseSql(connection, insertQuery);

      // Then: bootstrap sync exports the seeded history row
      expect(rowCount).toBe(1);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }, 30_000);

  test('INSERT INTO with watermark predicate only exports rows newer than destination high-water mark', async () => {
    // Given: Postgres has a newer history version and the destination already holds v1
    const destTable = 'wh_sql_int_watermark_incremental';
    const connStr = buildPgConnectionURI({ host, port, dbname: database, username, password });

    const pgClient = new pg.Client({ host, port, database, user: username, password });
    await pgClient.connect();
    try {
      await pgClient.query(
        `INSERT INTO "${HISTORY_TABLE}" (id, "versionId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
        [HISTORY_ROW_V2.id, HISTORY_ROW_V2.versionId, HISTORY_ROW_V2.content, HISTORY_ROW_V2.lastUpdated]
      );

      const watermarkPredicate = buildMaxLastUpdatedWatermarkPredicate(`main.${destTable}`, HISTORY_TABLE);
      const projectedSelect = buildSelectFromHistoryTableQuery(HISTORY_TABLE, watermarkPredicate);
      const insertQuery = buildInsertIntoSelectQuery(`main.${destTable}`, projectedSelect);

      const instance = await DuckDBInstance.create(':memory:');
      const connection = await instance.connect();
      try {
        await connection.run('INSTALL postgres; LOAD postgres;');
        await connection.run(buildDuckdbPostgresAttachQuery(connStr));
        await createDestTable(connection, destTable);
        await connection.run(`
          INSERT INTO "${destTable}" (id, version_id, content, last_updated, project_id)
          VALUES (
            '${HISTORY_ROW_V1.id}',
            '${HISTORY_ROW_V1.versionId}',
            '${HISTORY_ROW_V1.content.replaceAll("'", "''")}',
            TIMESTAMPTZ '${HISTORY_ROW_V1.lastUpdated}',
            'project-from-resource'
          );
        `);

        // When: DuckDB runs the watermark-filtered insert
        const rowCount = await runParameterizedWarehouseSql(connection, insertQuery);

        // Then: only the newer history row is inserted
        expect(rowCount).toBe(1);

        // Then: the destination contains both versions ordered by last_updated
        const readSql = new SqlBuilder();
        readSql.append(`SELECT version_id::VARCHAR AS version_id FROM "${destTable}" ORDER BY last_updated`);
        const readResult = await runParameterizedWarehouseSqlReadAll(connection, readSql);
        const versions = readResult.getRowObjectsJson().map((row) => (row as { version_id: string }).version_id);
        expect(versions).toStrictEqual(['1', '2']);
      } finally {
        connection.closeSync();
        instance.closeSync();
      }
    } finally {
      await pgClient.query(`DELETE FROM "${HISTORY_TABLE}" WHERE id = $1 AND "versionId" = $2`, [
        HISTORY_ROW_V2.id,
        HISTORY_ROW_V2.versionId,
      ]);
      await pgClient.end();
    }
  }, 30_000);

  test('INSERT INTO with watermark and startDate predicates executes against joined history query', async () => {
    // Given: an empty destination and combined watermark plus startDate predicates on the joined select
    const destTable = 'wh_sql_int_watermark_start_date';
    const connStr = buildPgConnectionURI({ host, port, dbname: database, username, password });
    const sourcePredicate = new Conjunction([
      buildMaxLastUpdatedWatermarkPredicate(`main.${destTable}`, HISTORY_TABLE),
      buildStartDatePredicate('2024-01-01T00:00:00.000Z', HISTORY_TABLE),
    ]);
    const projectedSelect = buildSelectFromHistoryTableQuery(HISTORY_TABLE, sourcePredicate);
    const insertQuery = buildInsertIntoSelectQuery(`main.${destTable}`, projectedSelect);

    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await connection.run('INSTALL postgres; LOAD postgres;');
      await connection.run(buildDuckdbPostgresAttachQuery(connStr));
      await createDestTable(connection, destTable);

      // When: DuckDB executes the combined predicate inside the joined history query
      const rowCount = await runParameterizedWarehouseSql(connection, insertQuery);

      // Then: the seeded row passes both filters
      expect(rowCount).toBe(1);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }, 30_000);
});
