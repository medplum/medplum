// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** Integration: Postgres history row → DuckDB INSERT with subquery-projected json_extract_string. */

import { DuckDBInstance } from '@duckdb/node-api';
import pg from 'pg';
import { loadTestConfig } from '../config/loader';
import { SqlBuilder } from '../fhir/sql';
import { buildPgConnectionURI } from './config';
import {
  buildDuckdbPostgresAttachQuery,
  buildInsertIntoSelectQuery,
  buildSelectFromHistoryTableQuery,
  runParameterizedWarehouseSql,
  runParameterizedWarehouseSqlReadAll,
} from './warehouse-sql';

const HISTORY_TABLE = 'DwWarehouseSqlIntTest_history';
const DEST_TABLE = 'wh_sql_int_dest';

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
          id TEXT NOT NULL,
          "versionId" TEXT NOT NULL,
          content TEXT NOT NULL,
          "lastUpdated" TIMESTAMPTZ NOT NULL
        );
      `);
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
      await connection.run(buildDuckdbPostgresAttachQuery(connStr));
      await connection.run(`
        CREATE TABLE "${DEST_TABLE}" (
          id VARCHAR,
          version_id VARCHAR,
          content VARCHAR,
          last_updated TIMESTAMPTZ,
          project_id VARCHAR
        );
      `);

      const rowCount = await runParameterizedWarehouseSql(connection, insertQuery);
      expect(rowCount).toBe(1);

      const readSql = new SqlBuilder();
      readSql.append(`SELECT id, project_id FROM "${DEST_TABLE}"`);
      const readResult = await runParameterizedWarehouseSqlReadAll(connection, readSql);
      const row = readResult.getRowObjectsJson()[0] as { id: string; project_id: string };
      expect(row.id).toBe('patient-wh-sql-1');
      expect(row.project_id).toBe('project-from-json');
    } finally {
      connection.closeSync();
    }
  }, 30_000);
});
