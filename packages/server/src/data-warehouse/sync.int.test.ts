// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** Integration tests for sync.ts: Postgres (medplum_test) → syncData → Parquet on disk. Worker wiring is tested in workers/data-warehouse-sync.test.ts. */

import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTestConfig } from '../config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import { toIcebergTableName } from './config';
import { LocalParquetWarehouseDestination } from './destination';
import { syncData } from './sync';

/** Isolated tables in medplum_test so we do not collide with real FHIR tables. */
const RESOURCE_TABLE = 'DwSyncIntTestPatient';
const HISTORY_TABLE = 'DwSyncIntTestPatient_History';
const TOMBSTONE_RESOURCE_TABLE = 'DwSyncIntTestTombstone';
const TOMBSTONE_HISTORY_TABLE = 'DwSyncIntTestTombstone_History';

function assertParquetMagic(bytes: Buffer): void {
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('PAR1');
  expect(bytes.subarray(bytes.length - 4).toString('ascii')).toBe('PAR1');
}

function buildReadParquetFirstRowProjectionQuery(parquetPath: string): string {
  const escapedPath = parquetPath.replaceAll("'", "''");
  return `SELECT id::VARCHAR AS id, project_id::VARCHAR AS project_id FROM read_parquet('${escapedPath}') LIMIT 1`;
}

function buildReadParquetRowQuery(parquetPath: string): string {
  const escapedPath = parquetPath.replaceAll("'", "''");
  return `SELECT id::VARCHAR AS id, content::VARCHAR AS content, project_id::VARCHAR AS project_id FROM read_parquet('${escapedPath}')`;
}

/**
 * Exercises the local Parquet destination by writing a single row to a dedicated Postgres history table,
 * then syncing it to a local Parquet file.
 */
describe('syncData local destination (integration)', () => {
  let host: string;
  let port: number;
  let database: string;
  let username: string;
  let password: string;
  let outDir: string | undefined;

  /**
   * Generates some fake test data
   */
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config);
    const db = config.database;
    host = db.host ?? '';
    port = db.port ?? 5432;
    database = db.dbname ?? '';
    username = db.username ?? '';
    password = db.password ?? '';

    const pool = getDatabasePool(DatabaseMode.WRITER);
    await pool.query(`DROP TABLE IF EXISTS "${HISTORY_TABLE}"`);
    await pool.query(`DROP TABLE IF EXISTS "${RESOURCE_TABLE}"`);
    await pool.query(`
      CREATE TABLE "${RESOURCE_TABLE}" (
        id TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        content TEXT NOT NULL,
        "lastUpdated" TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE "${HISTORY_TABLE}" (
        id TEXT NOT NULL,
        "versionId" TEXT NOT NULL,
        content TEXT NOT NULL,
        "lastUpdated" TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(
      `INSERT INTO "${RESOURCE_TABLE}" (id, "projectId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [
        'patient-int-1',
        'project-from-resource',
        JSON.stringify({
          resourceType: 'Patient',
          id: 'patient-int-1',
          meta: { project: 'project-from-json' },
        }),
        '2024-06-01T12:00:00.000Z',
      ]
    );
    await pool.query(
      `INSERT INTO "${HISTORY_TABLE}" (id, "versionId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [
        'patient-int-1',
        '1',
        JSON.stringify({
          resourceType: 'Patient',
          id: 'patient-int-1',
          meta: { project: 'project-from-json' },
        }),
        '2024-06-01T12:00:00.000Z',
      ]
    );
  }, 10_000);

  afterAll(async () => {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    await pool.query(`DROP TABLE IF EXISTS "${HISTORY_TABLE}"`);
    await pool.query(`DROP TABLE IF EXISTS "${RESOURCE_TABLE}"`);
    await closeDatabase();
    if (outDir) {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 10_000); // DROP TABLE shouldn't take this long, but on CI it might

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'medplum-dw-destination-'));
  });

  afterEach(() => {
    if (outDir) {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('exports projected history rows to a Parquet file via local destination', async () => {
    // Given: an isolated warehouse source and local parquet destination
    const warehouseSources = [HISTORY_TABLE].map((postgresTable) => ({
      postgresTable,
      icebergTable: toIcebergTableName(postgresTable),
    }));
    const destination = new LocalParquetWarehouseDestination(outDir as string);

    // When: we run data warehouse sync against the seeded history table
    const result = await syncData({
      database: { host, port, dbname: database, username, password },
      warehouseSources,
      destination,
    });

    // Then: sync reports an inserted parquet artifact for the expected table
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]?.rowsInserted).toBe(1);
    expect(result.tables[0]?.destination).toContain(`${warehouseSources[0]?.icebergTable}.parquet`);

    // Then: the written file is a valid parquet payload
    const parquetPath = result.tables[0]?.destination;
    assertParquetMagic(readFileSync(parquetPath));

    // Then: projected row values are readable and match the joined resource table
    const instance = await DuckDBInstance.create(':memory:');
    const c = await instance.connect();
    try {
      const res = await c.runAndReadAll(buildReadParquetFirstRowProjectionQuery(parquetPath));
      const row = res.getRowObjectsJson()[0] as { id: string; project_id: string | null };
      expect(row.id).toBe('patient-int-1');
      expect(row.project_id).toBe('project-from-resource');
    } finally {
      c.closeSync();
      instance.closeSync();
    }
  }, 30_000); // longer timeout because of database operations

  test('exports history rows with empty content to Parquet (deleted resource tombstones)', async () => {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    await pool.query(`DROP TABLE IF EXISTS "${TOMBSTONE_HISTORY_TABLE}"`);
    await pool.query(`DROP TABLE IF EXISTS "${TOMBSTONE_RESOURCE_TABLE}"`);
    await pool.query(`
      CREATE TABLE "${TOMBSTONE_RESOURCE_TABLE}" (
        id TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        content TEXT NOT NULL,
        "lastUpdated" TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE "${TOMBSTONE_HISTORY_TABLE}" (
        id TEXT NOT NULL,
        "versionId" TEXT NOT NULL,
        content TEXT NOT NULL,
        "lastUpdated" TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(
      `INSERT INTO "${TOMBSTONE_RESOURCE_TABLE}" (id, "projectId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      ['patient-tombstone-1', 'tombstone-project', '', '2024-06-01T12:00:00.000Z']
    );
    await pool.query(
      `INSERT INTO "${TOMBSTONE_HISTORY_TABLE}" (id, "versionId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      ['patient-tombstone-1', '1', '', '2024-06-01T12:00:00.000Z']
    );

    try {
      const warehouseSources = [TOMBSTONE_HISTORY_TABLE].map((postgresTable) => ({
        postgresTable,
        icebergTable: toIcebergTableName(postgresTable),
      }));
      const destination = new LocalParquetWarehouseDestination(outDir as string);

      const result = await syncData({
        database: { host, port, dbname: database, username, password },
        warehouseSources,
        destination,
      });

      expect(result.tables).toHaveLength(1);
      expect(result.tables[0]?.rowsInserted).toBe(1);

      const parquetPath = result.tables[0]?.destination;
      assertParquetMagic(readFileSync(parquetPath));

      const instance = await DuckDBInstance.create(':memory:');
      const c = await instance.connect();
      try {
        const res = await c.runAndReadAll(buildReadParquetRowQuery(parquetPath));
        const row = res.getRowObjectsJson()[0] as {
          id: string;
          content: string | null;
          project_id: string | null;
        };
        expect(row.id).toBe('patient-tombstone-1');
        expect(row.content).toBe('');
        expect(row.project_id).toBe('tombstone-project');
      } finally {
        c.closeSync();
        instance.closeSync();
      }
    } finally {
      await pool.query(`DROP TABLE IF EXISTS "${TOMBSTONE_HISTORY_TABLE}"`);
      await pool.query(`DROP TABLE IF EXISTS "${TOMBSTONE_RESOURCE_TABLE}"`);
    }
  }, 30_000);
});
