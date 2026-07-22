// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { DuckDBInstance } from '@duckdb/node-api';
import pg from 'pg';
import { loadTestConfig } from '../config/loader';
import {
  buildPgConnectionURI,
  DEFAULT_DW_DATABASE_APPLICATION_NAME,
  DEFAULT_DW_DATABASE_STATEMENT_TIMEOUT,
} from './config';
import { buildDuckdbPostgresAttachQuery } from './warehouse-sql';

/**
 * Exercises PostgreSQL URI connection string builders against DuckDB's postgres `ATTACH`
 * (same path as data-warehouse sync). Direct pg checks use structured client config with the same `options` value.
 */
describe('config (integration)', () => {
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
  }, 60_000);

  test('buildPostgresConnectionUriFromMedplumDatabaseConfig applies default and custom statement_timeout', async () => {
    const withDefault = buildPgConnectionURI({
      host,
      port,
      dbname: database,
      username,
      password,
    });
    expect(new URL(withDefault).searchParams.get('options')).toBe(
      `-c statement_timeout=${DEFAULT_DW_DATABASE_STATEMENT_TIMEOUT}`
    );

    const c = new pg.Client({
      host,
      port,
      database,
      user: username,
      password,
      options: '-c statement_timeout=6000',
    });
    await c.connect();
    try {
      const { rows } = await c.query(`select current_setting('statement_timeout') as t`);
      expect(rows[0]?.t).toBe('6s');
    } finally {
      await c.end();
    }
  }, 30_000);

  test('buildPostgresConnectionUriFromMedplumDatabaseConfig connects via DuckDB with expected session settings', async () => {
    const connStr = buildPgConnectionURI({
      host,
      port,
      dbname: database,
      username,
      password,
      queryTimeout: 3000,
    });

    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await connection.run('INSTALL postgres; LOAD postgres;');
      await connection.run(buildDuckdbPostgresAttachQuery(connStr, 'pgprobe'));
      const res = await connection.runAndReadAll(
        "SELECT * FROM postgres_query('pgprobe', 'SELECT current_setting(''statement_timeout'') AS t, current_setting(''application_name'') AS application_name');"
      );
      const row = res.getRowObjectsJson()[0] as { t: string; application_name: string };
      expect(row.t).toBe('3s');
      expect(row.application_name).toBe(DEFAULT_DW_DATABASE_APPLICATION_NAME);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }, 30_000);
});
