// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MedplumDatabaseConfig } from '../config/types';
import type { WarehouseSourceTable } from './config';
import { buildPgConnectionURI } from './config';
import type { DataWarehouseSink, DuckdbConnectionForSink } from './sink';
import { buildCountFromHistoryTableQuery, DEFAULT_NAMESPACE } from './warehouse-sql';

export interface SyncOptions {
  database: MedplumDatabaseConfig;
  warehouseSources: WarehouseSourceTable[];
  sink: DataWarehouseSink;
  namespace?: string;
  onProgress?: (message: string, metadata?: Record<string, string | number>) => void;
}

export interface SyncResourceResult {
  icebergTable: string;
  table: string;
  count: number;
  action: SyncAction;
}

export interface SyncResult {
  resources: SyncResourceResult[];
}

export type SyncAction = 'skip-empty' | 'insert';

export function getSyncAction(count: number): SyncAction {
  if (count === 0) {
    return 'skip-empty';
  }

  return 'insert';
}

function logSyncProgress(
  options: SyncOptions,
  message: string,
  metadata: Record<string, string | number> | undefined
): void {
  if (options.onProgress) {
    options.onProgress(message, metadata);
    return;
  }

  console.log(message);
}

function getSyncSourceConnectionString(options: SyncOptions): string {
  return buildPgConnectionURI(options.database);
}

type WarehouseSyncDuckdbConnection = DuckdbConnectionForSink & {
  runAndReadAll(query: string): Promise<{ getRowObjectsJson(): unknown[] }>;
  closeSync(): void;
};

async function runWarehouseTableSync(
  connection: WarehouseSyncDuckdbConnection,
  options: SyncOptions,
  namespace: string
): Promise<SyncResourceResult[]> {
  const results: SyncResourceResult[] = [];

  for (const spec of options.warehouseSources) {
    const { postgresTable, icebergTable } = spec;
    const sourcePredicate = options.sink.buildSourcePredicate(spec, namespace);
    const resultTableName = options.sink.getDestinationName(spec);
    await options.sink.ensureTargetExists(spec, namespace);

    const countReader = await connection.runAndReadAll(buildCountFromHistoryTableQuery(postgresTable, sourcePredicate));
    const count = Number((countReader.getRowObjectsJson() as { count: number }[])[0]?.count ?? 0);
    const action = getSyncAction(count);

    if (action === 'insert') {
      logSyncProgress(options, `Syncing ${icebergTable}: ${count} rows`, {
        table: resultTableName,
        icebergTable,
        count,
        action,
      });
      await options.sink.writeRows(connection, { tableSpec: spec, namespace, sourcePredicate });
    } else {
      logSyncProgress(options, `Skipping ${icebergTable}: no new rows`, {
        table: resultTableName,
        icebergTable,
        count,
        action,
      });
    }

    results.push({
      icebergTable,
      table: resultTableName,
      count,
      action,
    });
  }

  return results;
}

export async function syncData(options: SyncOptions): Promise<SyncResult> {
  const sourceConnectionString = getSyncSourceConnectionString(options);
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;

  let connection: WarehouseSyncDuckdbConnection | undefined;
  let duckdbTempDir: string | undefined;
  try {
    // create a temporary directory for the DuckDB database
    duckdbTempDir = mkdtempSync(join(tmpdir(), `medplum-dw-sync-${Date.now()}-`));
    const duckdbDatabasePath = join(duckdbTempDir, 'warehouse.duckdb');
    const instance = await DuckDBInstance.create(duckdbDatabasePath);
    connection = await instance.connect();
    for (const q of options.sink.getSetupQueries(sourceConnectionString)) {
      await connection.run(q);
    }

    if (!options.warehouseSources.length) {
      throw new Error('warehouseSources is required: use --table with at least one Postgres table name.');
    }

    const resources = await runWarehouseTableSync(connection, options, namespace);
    return { resources };
  } finally {
    // close the DuckDB connection
    connection?.closeSync();
    /*
     * DuckDB often creates companion files next to the database, so
     * we're gonna delete the whole directory.
     */
    if (duckdbTempDir) {
      rmSync(duckdbTempDir, { recursive: true, force: true });
    }
  }
}
