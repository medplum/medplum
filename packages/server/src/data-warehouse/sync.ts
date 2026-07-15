// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MedplumDatabaseConfig } from '../config/types';
import type { Expression } from '../fhir/sql';
import { Conjunction } from '../fhir/sql';
import { globalLogger } from '../logger';
import type { WarehouseSourceTable } from './config';
import { buildPgConnectionURI } from './config';
import type { DataWarehouseDestination } from './destination';
import type { DuckdbConnection } from './warehouse-sql';
import { buildStartDatePredicate, DEFAULT_NAMESPACE } from './warehouse-sql';

export interface SyncOptions {
  database: MedplumDatabaseConfig;
  warehouseSources: WarehouseSourceTable[];
  destination: DataWarehouseDestination;
  namespace?: string;
  /** Earliest history `lastUpdated` to export (ISO-8601 date or date-time string). */
  startDate?: string;
  /** FHIR resource types to include; omitted means all types. */
  includeResourceTypes?: string[];
  /** FHIR resource types to exclude from sync. */
  excludeResourceTypes?: string[];
  onProgress?: (message: string, metadata?: Record<string, string | number>) => void | Promise<void>;
}

export interface SyncTableResult {
  destination: string;
  rowsInserted: number;
  syncDurationMs: number;
  watermarkDurationMs: number;
}

export interface SyncResult {
  tables: SyncTableResult[];
}

function getSyncSourceConnectionString(options: SyncOptions): string {
  return buildPgConnectionURI(options.database);
}

export async function buildWarehouseSourcePredicate(
  connection: DuckdbConnection,
  options: SyncOptions,
  tableSpec: WarehouseSourceTable,
  namespace: string
): Promise<Expression | undefined> {
  const destinationPredicate = await options.destination.buildSourcePredicate(connection, tableSpec, namespace);
  if (!options.startDate) {
    return destinationPredicate;
  }

  const startDatePredicate = buildStartDatePredicate(options.startDate);
  return destinationPredicate ? new Conjunction([destinationPredicate, startDatePredicate]) : startDatePredicate;
}

type WarehouseSyncDuckdbConnection = DuckdbConnection & {
  closeSync(): void;
};

/**
 * Opens a fresh DuckDB instance/connection backed by a throwaway temp directory,
 * runs the destination setup queries, invokes `fn`, and tears everything down
 * afterwards. A new database is created and destroyed for each invocation.
 * @param options - The sync options.
 * @param sourceConnectionString - The Postgres source connection string.
 * @param fn - Callback invoked with the ready-to-use DuckDB connection.
 * @returns The value returned by `fn`.
 */
async function withWarehouseConnection<T>(
  options: SyncOptions,
  sourceConnectionString: string,
  fn: (connection: WarehouseSyncDuckdbConnection) => Promise<T>
): Promise<T> {
  let connection: WarehouseSyncDuckdbConnection | undefined;
  let instance: DuckDBInstance | undefined;
  let duckdbTempDir: string | undefined;
  try {
    // create a temporary directory for the DuckDB database
    duckdbTempDir = await mkdtemp(join(tmpdir(), `medplum-dw-sync-`));
    const duckdbDatabasePath = join(duckdbTempDir, 'warehouse.duckdb');
    instance = await DuckDBInstance.create(duckdbDatabasePath);
    connection = await instance.connect();
    for (const q of options.destination.getSetupQueries()) {
      await connection.run(q);
    }

    return await fn(connection);
  } finally {
    try {
      connection?.closeSync();
    } catch (err) {
      globalLogger.warn('Failed closing data warehouse DuckDB connection', { err, subsystem: 'data-warehouse-sync' });
    }

    try {
      instance?.closeSync();
    } catch (err) {
      globalLogger.warn('Failed closing data warehouse DuckDB instance', { err, subsystem: 'data-warehouse-sync' });
    }

    /*
     * DuckDB often creates companion files next to the database, so
     * we're gonna delete the whole directory.
     */
    if (duckdbTempDir) {
      try {
        await rm(duckdbTempDir, { recursive: true, force: true });
      } catch (err) {
        globalLogger.warn('Failed deleting data warehouse DuckDB temp dir', {
          err,
          subsystem: 'data-warehouse-sync',
        });
      }
    }
  }
}

async function syncWarehouseTable(
  connection: WarehouseSyncDuckdbConnection,
  options: SyncOptions,
  spec: WarehouseSourceTable,
  namespace: string,
  sourceConnectionString: string,
  index: number,
  tablesTotal: number
): Promise<SyncTableResult> {
  const tablesCompleted = index + 1;
  const destination = options.destination.getDestinationName(spec);

  const syncStartTime = Date.now();

  await options.destination.ensureTargetExists(spec, namespace);

  const watermarkStartTime = Date.now();
  const sourcePredicate = await buildWarehouseSourcePredicate(connection, options, spec, namespace);
  const watermarkDurationMs = Date.now() - watermarkStartTime;

  for (const query of options.destination.getPostgresAttachQueries(sourceConnectionString)) {
    await connection.run(query);
  }

  const rowsInserted = await options.destination.writeRows(connection, {
    tableSpec: spec,
    namespace,
    sourcePredicate,
  });

  const syncEndTime = Date.now();
  const syncDurationMs = syncEndTime - syncStartTime;

  globalLogger.info(`Data warehouse sync finished for table=${destination}`, {
    tableIndex: tablesCompleted,
    tablesCompleted,
    tablesTotal,
    destination,
    rowsInserted,
    syncDurationMs,
    watermarkDurationMs,
    startDate: options.startDate,
    subsystem: 'data-warehouse-sync',
  });

  if (options.onProgress) {
    await options.onProgress(
      `Completed ${destination} (${rowsInserted} rows, table ${tablesCompleted}/${tablesTotal})`,
      {
        tablesCompleted,
        tablesTotal,
        destination,
        rowsInserted,
      }
    );
  }

  return {
    destination,
    rowsInserted,
    syncDurationMs,
    watermarkDurationMs,
  };
}

async function runWarehouseTableSync(
  options: SyncOptions,
  namespace: string,
  sourceConnectionString: string
): Promise<SyncTableResult[]> {
  const tables: SyncTableResult[] = [];

  const tablesTotal = options.warehouseSources.length;

  for (const [index, spec] of options.warehouseSources.entries()) {
    // Close and re-open the DuckDB database between tables so each table sync
    // runs against a fresh instance/connection and temp directory.
    const result = await withWarehouseConnection(options, sourceConnectionString, (connection) =>
      syncWarehouseTable(connection, options, spec, namespace, sourceConnectionString, index, tablesTotal)
    );
    tables.push(result);
  }

  return tables;
}

export async function syncData(options: SyncOptions): Promise<SyncResult> {
  if (!options.warehouseSources.length) {
    throw new Error('warehouseSources must include at least one table.');
  }

  const sourceConnectionString = getSyncSourceConnectionString(options);
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;

  const tables = await runWarehouseTableSync(options, namespace, sourceConnectionString);
  return { tables };
}
