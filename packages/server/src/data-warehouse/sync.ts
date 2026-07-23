// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { DuckDBInstance } from '@duckdb/node-api';
import { normalizeErrorString } from '@medplum/core';
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

/** Max concurrent DuckDB connections used to read Iceberg watermarks in parallel. */
const WATERMARK_READ_CONCURRENCY = 8;

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

export type SyncTableSkipReason = 'skipped-conflict' | 'skipped-watermark' | 'skipped-missing-table';

export interface SyncTableResult {
  destination: string;
  /** Set when the table was skipped; omitted on successful sync. */
  status?: SyncTableSkipReason;
  rowsInserted: number;
  syncDurationMs: number;
  watermarkDurationMs: number;
}

export interface SyncResult {
  tables: SyncTableResult[];
}

interface WarehouseTableWatermark {
  spec: WarehouseSourceTable;
  sourcePredicate: Expression | undefined;
  watermarkDurationMs: number;
  /**
   * Present when this table will not be written: Iceberg watermark read failed, or the
   * destination target is missing.
   */
  status?: 'skipped-watermark' | 'skipped-missing-table';
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

function closeWarehouseConnection(connection: WarehouseSyncDuckdbConnection | undefined, label: string): void {
  if (!connection) {
    return;
  }
  try {
    connection.closeSync();
  } catch (err) {
    globalLogger.warn(`Failed closing data warehouse DuckDB ${label}`, { err, subsystem: 'data-warehouse-sync' });
  }
}

async function connectWarehouse(
  instance: DuckDBInstance,
  options: SyncOptions,
  label: string
): Promise<WarehouseSyncDuckdbConnection> {
  const connection = await instance.connect();
  try {
    for (const query of options.destination.getConnectionSetupQueries()) {
      await connection.run(query);
    }
    return connection;
  } catch (err) {
    closeWarehouseConnection(connection, label);
    throw err;
  }
}

/**
 * Opens a DuckDB instance (backed by a throwaway temp directory), runs destination
 * setup on a short-lived connection, invokes `fn` with the instance, and tears
 * everything down afterwards.
 * @param options - The sync options.
 * @param fn - Callback invoked with the ready-to-use DuckDB instance.
 * @returns The value returned by `fn`.
 */
async function withWarehouseConnection<T>(
  options: SyncOptions,
  fn: (instance: DuckDBInstance) => Promise<T>
): Promise<T> {
  let instance: DuckDBInstance | undefined;
  let duckdbTempDir: string | undefined;
  try {
    // create a temporary directory for the DuckDB database
    duckdbTempDir = await mkdtemp(join(tmpdir(), `medplum-dw-sync-`));
    const duckdbDatabasePath = join(duckdbTempDir, 'warehouse.duckdb');
    instance = await DuckDBInstance.create(duckdbDatabasePath);

    // Instance-scoped setup (extensions, secrets, ATTACH) is shared by later connections.
    // Session SETs are connection-scoped and applied in connectWarehouse().
    const setupConnection = await instance.connect();
    try {
      for (const q of options.destination.getSetupQueries()) {
        await setupConnection.run(q);
      }
    } finally {
      closeWarehouseConnection(setupConnection, 'setup connection');
    }

    return await fn(instance);
  } finally {
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

/*
 * Reads one table's destination existence check and Iceberg watermark.
 * Never throws: failures become skip entries so watermark workers can finish their stripe.
 */
async function readWarehouseTableWatermark(
  connection: WarehouseSyncDuckdbConnection,
  options: SyncOptions,
  spec: WarehouseSourceTable,
  namespace: string
): Promise<WarehouseTableWatermark> {
  const watermarkStartTime = Date.now();
  let destination = spec.icebergTable;
  let phase: 'setup' | 'ensure' | 'watermark' = 'setup';
  try {
    destination = options.destination.getDestinationName(spec);
    phase = 'ensure';
    await options.destination.ensureTargetExists(spec, namespace);
    phase = 'watermark';
    const sourcePredicate = await buildWarehouseSourcePredicate(connection, options, spec, namespace);
    return {
      spec,
      sourcePredicate,
      watermarkDurationMs: Date.now() - watermarkStartTime,
    };
  } catch (err) {
    const status = phase === 'ensure' ? 'skipped-missing-table' : 'skipped-watermark';
    globalLogger.warn(
      status === 'skipped-missing-table'
        ? `Data warehouse destination table missing for table=${destination}`
        : `Failed reading data warehouse watermark for table=${destination}`,
      {
        destination,
        err,
        subsystem: 'data-warehouse-sync',
      }
    );
    return {
      spec,
      sourcePredicate: undefined,
      watermarkDurationMs: Date.now() - watermarkStartTime,
      status,
    };
  }
}

/**
 * Resolves incremental source predicates for every warehouse table.
 *
 * Per-table existence checks and Iceberg watermark DuckDB reads fan out across
 * watermark connections on the same instance (one query per connection). All watermark
 * work finishes before this returns so the caller can attach Postgres afterwards.
 * Per-table failures are logged and returned as skip entries (`skipped-missing-table` or
 * `skipped-watermark`); successful tables still sync.
 *
 * @param instance - Shared DuckDB instance used to open watermark connections.
 * @param options - Sync options including destination and warehouse source tables.
 * @param namespace - Iceberg / warehouse namespace for target tables.
 * @returns One entry per warehouse source table (including skip entries), sorted by Iceberg table name.
 */
async function collectWarehouseWatermarks(
  instance: DuckDBInstance,
  options: SyncOptions,
  namespace: string
): Promise<WarehouseTableWatermark[]> {
  const sources = options.warehouseSources;
  const concurrency = Math.min(WATERMARK_READ_CONCURRENCY, sources.length);
  const watermarkConnections: WarehouseSyncDuckdbConnection[] = [];
  try {
    // Open one DuckDB connection per watermark worker.
    for (let i = 0; i < concurrency; i++) {
      watermarkConnections.push(await connectWarehouse(instance, options, 'watermark connection'));
    }

    // Fan out: worker i owns sources[i], sources[i + concurrency], …
    // Use allSettled so we never close connections while sibling workers still have in-flight queries.
    const settled = await Promise.allSettled(
      watermarkConnections.map(async (connection, workerIndex) => {
        const results: WarehouseTableWatermark[] = [];
        for (let i = workerIndex; i < sources.length; i += concurrency) {
          results.push(await readWarehouseTableWatermark(connection, options, sources[i], namespace));
        }
        return results;
      })
    );

    // sort alphabetically because some jobs will finish faster than others
    return settled
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .sort((a, b) => a.spec.icebergTable.localeCompare(b.spec.icebergTable));
  } finally {
    // Close watermark connections before Postgres is attached.
    for (const connection of watermarkConnections) {
      closeWarehouseConnection(connection, 'watermark connection');
    }
  }
}

async function writeWarehouseTable(
  connection: WarehouseSyncDuckdbConnection,
  options: SyncOptions,
  watermark: WarehouseTableWatermark,
  namespace: string,
  index: number,
  tablesTotal: number
): Promise<SyncTableResult> {
  const tablesCompleted = index + 1;
  const { spec, sourcePredicate, watermarkDurationMs } = watermark;
  const destination = options.destination.getDestinationName(spec);

  const syncStartTime = Date.now();
  const rowsInserted = await options.destination.writeRows(connection, {
    tableSpec: spec,
    namespace,
    sourcePredicate,
  });
  const syncDurationMs = Date.now() - syncStartTime;

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

function buildSkippedTableResult(
  destination: string,
  status: SyncTableSkipReason,
  watermarkDurationMs: number
): SyncTableResult {
  return {
    destination,
    status,
    rowsInserted: 0,
    syncDurationMs: 0,
    watermarkDurationMs,
  };
}

async function reportSkippedTableProgress(
  options: SyncOptions,
  destination: string,
  reason: string,
  tablesCompleted: number,
  tablesTotal: number
): Promise<void> {
  if (!options.onProgress) {
    return;
  }
  await options.onProgress(`Skipped ${destination} (${reason}, table ${tablesCompleted}/${tablesTotal})`, {
    tablesCompleted,
    tablesTotal,
    destination,
    rowsInserted: 0,
  });
}

async function runWarehouseTableSync(
  options: SyncOptions,
  namespace: string,
  sourceConnectionString: string
): Promise<SyncTableResult[]> {
  return withWarehouseConnection(options, async (instance) => {
    // in one session, grabs all high-watermarks for all tables (before Postgres attach)
    const watermarks = await collectWarehouseWatermarks(instance, options, namespace);
    const tablesTotal = options.warehouseSources.length;

    // in another session, connect to postgres only after every Iceberg watermark has been fetched
    const writeConnection = await connectWarehouse(instance, options, 'write connection');
    try {
      for (const query of options.destination.getPostgresAttachQueries(sourceConnectionString)) {
        await writeConnection.run(query);
      }

      const tables: SyncTableResult[] = [];

      // update each iceberg table (watermarks includes skip entries, so index tracks all sources)
      for (const [index, watermark] of watermarks.entries()) {
        const tablesCompleted = index + 1;
        const destination = options.destination.getDestinationName(watermark.spec);

        if (watermark.status === 'skipped-missing-table') {
          tables.push(buildSkippedTableResult(destination, 'skipped-missing-table', watermark.watermarkDurationMs));
          await reportSkippedTableProgress(
            options,
            destination,
            'destination table missing',
            tablesCompleted,
            tablesTotal
          );
          continue;
        }

        if (watermark.status === 'skipped-watermark') {
          tables.push(buildSkippedTableResult(destination, 'skipped-watermark', watermark.watermarkDurationMs));
          await reportSkippedTableProgress(options, destination, 'watermark read failed', tablesCompleted, tablesTotal);
          continue;
        }

        try {
          const result = await writeWarehouseTable(writeConnection, options, watermark, namespace, index, tablesTotal);
          tables.push(result);
        } catch (err) {
          const message = normalizeErrorString(err);
          if (!message.includes('CommitFailedException') && !message.includes('409')) {
            throw err;
          }

          globalLogger.info(
            `Skipping data warehouse sync for table=${destination} due to Iceberg commit conflict (likely compaction)`,
            {
              destination,
              tableIndex: tablesCompleted,
              tablesTotal,
              err,
              subsystem: 'data-warehouse-sync',
            }
          );

          tables.push(buildSkippedTableResult(destination, 'skipped-conflict', watermark.watermarkDurationMs));
          await reportSkippedTableProgress(
            options,
            destination,
            'Iceberg commit conflict',
            tablesCompleted,
            tablesTotal
          );
        }
      }

      return tables;
    } finally {
      closeWarehouseConnection(writeConnection, 'write connection');
    }
  });
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
