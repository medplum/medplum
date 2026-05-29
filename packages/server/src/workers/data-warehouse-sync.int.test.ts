// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for `data-warehouse-sync.ts` through `processDataWarehouseSyncJob`.
 *
 * Exercises the scheduled job entry point end-to-end: server config → `getDataWarehouseSyncOptions`
 * → real `syncData` → local Parquet on disk, against `medplum_test` with a dedicated history table.
 * Mocks only `getWarehouseSyncPostgresTableNames` to limit scope. Does not use BullMQ or Redis.
 *
 * Contrast with:
 * - `data-warehouse-sync.test.ts` — unit tests for worker/scheduler wiring (mocked `syncData` / BullMQ).
 * - `data-warehouse/sync.int.test.ts` — same export pipeline via `syncData` directly (no worker layer).
 */

import { DuckDBInstance } from '@duckdb/node-api';
import type { Job } from 'bullmq';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import type * as DataWarehouseConfigModule from '../data-warehouse/config';
import { toIcebergTableName } from '../data-warehouse/config';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import type { DataWarehouseSyncJobData } from './data-warehouse-sync';
import { processDataWarehouseSyncJob } from './data-warehouse-sync';

/** Isolated history table in medplum_test so we do not collide with real FHIR history tables. */
const HISTORY_TABLE = 'DwWorkerSyncIntTest_history';

jest.mock('../data-warehouse/config', () => {
  const actual: typeof DataWarehouseConfigModule = jest.requireActual('../data-warehouse/config');
  return {
    ...actual,
    getWarehouseSyncPostgresTableNames: jest.fn(() => [HISTORY_TABLE]),
  };
});

function assertParquetMagic(bytes: Buffer): void {
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('PAR1');
  expect(bytes.subarray(bytes.length - 4).toString('ascii')).toBe('PAR1');
}

function buildReadParquetFirstRowProjectionQuery(parquetPath: string): string {
  const escapedPath = parquetPath.replaceAll("'", "''");
  return `SELECT id::VARCHAR AS id, project_id::VARCHAR AS project_id FROM read_parquet('${escapedPath}') LIMIT 1`;
}

function buildTestConfig(outDir: string, base: MedplumServerConfig): MedplumServerConfig {
  return {
    ...base,
    readonlyDatabase: undefined,
    dataWarehouse: {
      enabled: true,
      cron: '0 * * * *',
      destination: 'local',
      localBasePath: outDir,
    },
  };
}

describe('processDataWarehouseSyncJob local destination (integration)', () => {
  let baseConfig: MedplumServerConfig;
  let config: MedplumServerConfig;
  let outDir: string | undefined;

  beforeAll(async () => {
    baseConfig = await loadTestConfig();
    await initDatabase(baseConfig);

    const pool = getDatabasePool(DatabaseMode.WRITER);
    await pool.query(`DROP TABLE IF EXISTS "${HISTORY_TABLE}"`);
    await pool.query(`
      CREATE TABLE "${HISTORY_TABLE}" (
        id TEXT NOT NULL,
        "versionId" TEXT NOT NULL,
        content TEXT NOT NULL,
        "lastUpdated" TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(
      `INSERT INTO "${HISTORY_TABLE}" (id, "versionId", content, "lastUpdated") VALUES ($1, $2, $3, $4)`,
      [
        'patient-worker-int-1',
        '1',
        JSON.stringify({
          resourceType: 'Patient',
          id: 'patient-worker-int-1',
          meta: { project: 'project-from-json' },
        }),
        '2024-06-01T12:00:00.000Z',
      ]
    );
  }, 10_000);

  afterAll(async () => {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    await pool.query(`DROP TABLE IF EXISTS "${HISTORY_TABLE}"`);
    await closeDatabase();
    if (outDir) {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 10_000);

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'medplum-dw-worker-sync-'));
    config = buildTestConfig(outDir, baseConfig);
  });

  afterEach(() => {
    if (outDir) {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('exports projected history rows to a Parquet file via scheduled sync job', async () => {
    const updateProgress = jest.fn().mockResolvedValue(undefined);
    const icebergTable = toIcebergTableName(HISTORY_TABLE);
    const expectedParquetPath = join(outDir as string, `${icebergTable}.parquet`);

    await processDataWarehouseSyncJob(config, {
      id: 'job-int-1',
      data: { trigger: 'scheduler' },
      updateProgress,
    } as unknown as Job<DataWarehouseSyncJobData>);

    expect(updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(`Synced ${icebergTable}: 1 row(s)`),
        icebergTable,
        count: 1,
      })
    );

    assertParquetMagic(readFileSync(expectedParquetPath));

    const instance = await DuckDBInstance.create(':memory:');
    const c = await instance.connect();
    try {
      const res = await c.runAndReadAll(buildReadParquetFirstRowProjectionQuery(expectedParquetPath));
      const row = res.getRowObjectsJson()[0] as { id: string; project_id: string | null };
      expect(row.id).toBe('patient-worker-int-1');
      expect(row.project_id).toBe('project-from-json');
    } finally {
      c.closeSync();
    }
  }, 30_000);
});
