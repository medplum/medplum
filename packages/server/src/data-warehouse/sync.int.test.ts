// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** Integration tests for sync.ts: Postgres (medplum_test) → syncData → fake S3 Iceberg. Worker wiring is tested in workers/data-warehouse-sync.test.ts; local Parquet e2e is in workers/data-warehouse-sync.int.test.ts. */

import { S3TablesWarehouseDestination } from '../cloud/aws/data-warehouse-destination';
import { loadTestConfig } from '../config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import { InsertQuery } from '../fhir/sql';
import { buildFakeIcebergColumnStatsSetupQueries } from './__test__/fake-iceberg-column-stats';
import type { WarehouseSourceTable } from './config';
import { toIcebergTableName } from './config';
import { syncData } from './sync';
import { DEFAULT_ICEBERG_CATALOG_ALIAS, DEFAULT_NAMESPACE } from './warehouse-sql';

/** Isolated history tables in medplum_test so we do not collide with real FHIR history tables. */
const PATIENT_HISTORY_TABLE = 'DwSyncWmPatient_History';
const OBSERVATION_HISTORY_TABLE = 'DwSyncWmObservation_History';
const PATIENT_ICEBERG = toIcebergTableName(PATIENT_HISTORY_TABLE);
const OBSERVATION_ICEBERG = toIcebergTableName(OBSERVATION_HISTORY_TABLE);
const PATIENT_QUALIFIED = `${DEFAULT_ICEBERG_CATALOG_ALIAS}.${DEFAULT_NAMESPACE}.${PATIENT_ICEBERG}`;
const OBSERVATION_QUALIFIED = `${DEFAULT_ICEBERG_CATALOG_ALIAS}.${DEFAULT_NAMESPACE}.${OBSERVATION_ICEBERG}`;

/**
 * Fake AWS S3 Tables Iceberg destination, but half-real DuckDB: in-memory `iceberg_catalog` +
 * `iceberg_column_stats` macro (no Iceberg extension).
 */
class FakeS3TablesWarehouseDestination extends S3TablesWarehouseDestination {
  readonly icebergTables: string[];
  readonly namespace: string;
  watermarkByQualifiedTable: Record<string, string>;

  constructor(options: {
    icebergTables: string[];
    namespace?: string;
    watermarkByQualifiedTable: Record<string, string>;
  }) {
    super('us-east-1', 'arn:aws:s3tables:us-east-1:000000000000:bucket/fake');
    this.icebergTables = options.icebergTables;
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE;
    this.watermarkByQualifiedTable = options.watermarkByQualifiedTable;
  }

  override getSetupQueries(): string[] {
    const createTables = this.icebergTables.map(
      (icebergTable) => `
        CREATE TABLE IF NOT EXISTS ${DEFAULT_ICEBERG_CATALOG_ALIAS}.${this.namespace}.${icebergTable} (
          id UUID,
          version_id UUID,
          content VARCHAR,
          last_updated TIMESTAMPTZ,
          project_id UUID
        );
      `
    );

    return [
      `ATTACH ':memory:' AS ${DEFAULT_ICEBERG_CATALOG_ALIAS}`,
      `CREATE SCHEMA IF NOT EXISTS ${DEFAULT_ICEBERG_CATALOG_ALIAS}.${this.namespace}`,
      ...createTables,
      ...buildFakeIcebergColumnStatsSetupQueries(this.watermarkByQualifiedTable),
      'INSTALL postgres',
      'LOAD postgres',
    ];
  }

  override getConnectionSetupQueries(): string[] {
    return ['SET threads = 1', 'SET pg_use_ctid_scan = false'];
  }

  override async ensureTargetExists(): Promise<void> {}
}

describe('syncData (integration)', () => {
  let host: string;
  let port: number;
  let database: string;
  let username: string;
  let password: string;

  const initialWatermarks = {
    [PATIENT_QUALIFIED]: '2024-06-01 12:00:00.000',
    [OBSERVATION_QUALIFIED]: '2024-07-01 00:00:00.000',
  };
  const afterFirstSyncWatermarks = {
    [PATIENT_QUALIFIED]: '2024-06-02 00:00:00.000',
    [OBSERVATION_QUALIFIED]: '2024-07-02 00:00:00.000',
  };

  const patient1 = {
    id: '3aa43dfe-c64d-465b-babc-700db9a0f780',
    versionId: 'e40eedbb-9d71-445a-b619-88b1e0df97cd',
    projectId: '6b3a4a25-15fa-4124-81d6-6903f5b1ee06',
  };
  const observation1 = {
    id: '7190258c-4cc5-40df-ba81-111fb1d80d12',
    projectId: patient1.projectId,
  };

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
    // One row at/before watermark (filtered out) and one after (exported on first sync).
    await createHistoryTable(pool, PATIENT_HISTORY_TABLE, [
      {
        id: patient1.id,
        versionId: patient1.versionId,
        content: historyContent('Patient', patient1),
        lastUpdated: '2024-05-01T00:00:00.000Z',
      },
      {
        id: patient1.id,
        versionId: '9e7bd58b-ec71-4fce-9cbf-8c0e1ce97199',
        content: historyContent('Patient', patient1),
        lastUpdated: '2024-06-02T00:00:00.000Z',
      },
    ]);
    await createHistoryTable(pool, OBSERVATION_HISTORY_TABLE, [
      {
        id: observation1.id,
        versionId: '34913591-3325-4aa2-97c2-644ab24489e0',
        content: historyContent('Observation', observation1),
        lastUpdated: '2024-06-15T00:00:00.000Z',
      },
      {
        id: observation1.id,
        versionId: '62c7cdbe-0f16-435f-83ea-445273b8e004',
        content: historyContent('Observation', observation1),
        lastUpdated: '2024-07-02T00:00:00.000Z',
      },
    ]);
  }, 10_000);

  afterAll(async () => {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    await pool.query(`DROP TABLE IF EXISTS "${PATIENT_HISTORY_TABLE}"`);
    await pool.query(`DROP TABLE IF EXISTS "${OBSERVATION_HISTORY_TABLE}"`);
    await closeDatabase();
  }, 10_000);

  /**
   * Real Postgres, fake AWS S3 Tables, real DuckDB and Parquet
   */
  test('e2e: incremental syncData Postgres to fake S3 Iceberg then empty second sync', async () => {
    // given
    const warehouseSources: WarehouseSourceTable[] = [
      { postgresTable: PATIENT_HISTORY_TABLE, icebergTable: PATIENT_ICEBERG },
      { postgresTable: OBSERVATION_HISTORY_TABLE, icebergTable: OBSERVATION_ICEBERG },
    ];
    const destination = new FakeS3TablesWarehouseDestination({
      icebergTables: [PATIENT_ICEBERG, OBSERVATION_ICEBERG],
      watermarkByQualifiedTable: initialWatermarks,
    });

    // when — first sync inserts only post-watermark rows
    const firstResult = await syncData({
      database: { host, port, dbname: database, username, password },
      warehouseSources,
      destination,
      namespace: DEFAULT_NAMESPACE,
    });

    // then
    expect(firstResult.tables).toHaveLength(2);
    expect(firstResult.tables.map((t) => t.rowsInserted)).toStrictEqual([1, 1]);
    expect(firstResult.tables.map((t) => t.destination)).toStrictEqual([OBSERVATION_ICEBERG, PATIENT_ICEBERG]);

    // when — simulate advancing watermarks as Iceberg column stats would after commit, then sync again
    destination.watermarkByQualifiedTable = afterFirstSyncWatermarks;
    const secondResult = await syncData({
      database: { host, port, dbname: database, username, password },
      warehouseSources,
      destination,
      namespace: DEFAULT_NAMESPACE,
    });

    // then — empty incremental delta
    expect(secondResult.tables).toHaveLength(2);
    expect(secondResult.tables.map((t) => t.rowsInserted)).toStrictEqual([0, 0]);

    // when — insert new history rows after the advanced watermarks, then sync again
    const pool = getDatabasePool(DatabaseMode.WRITER);
    await new InsertQuery(PATIENT_HISTORY_TABLE, [
      {
        id: patient1.id,
        versionId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
        content: historyContent('Patient', patient1),
        lastUpdated: '2024-06-03T00:00:00.000Z',
      },
    ]).execute(pool);
    await new InsertQuery(OBSERVATION_HISTORY_TABLE, [
      {
        id: observation1.id,
        versionId: 'b2c3d4e5-f6a7-4890-b123-456789abcdef',
        content: historyContent('Observation', observation1),
        lastUpdated: '2024-07-03T00:00:00.000Z',
      },
    ]).execute(pool);

    const thirdResult = await syncData({
      database: { host, port, dbname: database, username, password },
      warehouseSources,
      destination,
      namespace: DEFAULT_NAMESPACE,
    });

    // then — only the newly inserted rows are exported
    expect(thirdResult.tables).toHaveLength(2);
    expect(thirdResult.tables.map((t) => t.rowsInserted)).toStrictEqual([1, 1]);
  }, 30_000);
});

function historyContent(resourceType: string, resource: { id: string; projectId: string }): string {
  return JSON.stringify({
    resourceType,
    id: resource.id,
    meta: { project: resource.projectId },
  });
}

async function createHistoryTable(
  pool: ReturnType<typeof getDatabasePool>,
  tableName: string,
  rows: { id: string; versionId: string; content: string; lastUpdated: string }[]
): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS "${tableName}"`);
  await pool.query(`
    CREATE TABLE "${tableName}" (
      id UUID NOT NULL,
      "versionId" UUID NOT NULL,
      content TEXT NOT NULL,
      "lastUpdated" TIMESTAMPTZ NOT NULL
    );
  `);
  for (const row of rows) {
    await new InsertQuery(tableName, [
      {
        id: row.id,
        versionId: row.versionId,
        content: row.content,
        lastUpdated: row.lastUpdated,
      },
    ]).execute(pool);
  }
}
