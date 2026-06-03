// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MedplumDatabaseConfig, MedplumDataWarehouseResourceTypesConfig } from '../config/types';
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
  /** FHIR resource types to include/exclude; omitted means all types (see `warehouseSources`). */
  resourceTypes?: MedplumDataWarehouseResourceTypesConfig;
  onProgress?: (message: string, metadata?: Record<string, string | number>) => void | Promise<void>;
}

export interface SyncResourceResult {
  icebergTable: string;
  table: string;
  count: number;
}

export interface SyncResult {
  resources: SyncResourceResult[];
}

export type SyncAction = 'skip-empty' | 'insert';

function getSyncSourceConnectionString(options: SyncOptions): string {
  return buildPgConnectionURI(options.database);
}

export function buildWarehouseSourcePredicate(
  options: SyncOptions,
  tableSpec: WarehouseSourceTable,
  namespace: string
): Expression | undefined {
  const destinationPredicate = options.destination.buildSourcePredicate(tableSpec, namespace);
  if (!options.startDate) {
    return destinationPredicate;
  }

  const startDatePredicate = buildStartDatePredicate(options.startDate);
  return destinationPredicate ? new Conjunction([destinationPredicate, startDatePredicate]) : startDatePredicate;
}

type WarehouseSyncDuckdbConnection = DuckdbConnection & {
  closeSync(): void;
};

async function runWarehouseTableSync(
  connection: WarehouseSyncDuckdbConnection,
  options: SyncOptions,
  namespace: string
): Promise<SyncResourceResult[]> {
  const results: SyncResourceResult[] = [];

  const total = options.warehouseSources.length;

  globalLogger.info('Starting warehouse sync', {
    total,
    startDate: options.startDate,
    resourceTypes: options.resourceTypes,
    warehouseSources: options.warehouseSources.map((spec) => ({
      icebergTable: spec.icebergTable,
    })),
    subsystem: 'data-warehouse-sync',
  });

  for (const [index, spec] of options.warehouseSources.entries()) {
    const { icebergTable, postgresTable } = spec;
    const tableNumber = index + 1;
    const sourcePredicate = buildWarehouseSourcePredicate(options, spec, namespace);
    const resultTableName = options.destination.getDestinationName(spec);
    await options.destination.ensureTargetExists(spec, namespace);

    const count = await options.destination.writeRows(connection, {
      tableSpec: spec,
      namespace,
      sourcePredicate,
    });

    if (options.onProgress) {
      await options.onProgress(`Completed ${icebergTable}`, {
        tableNumber,
        total,
        icebergTable,
        postgresTable,
        table: resultTableName,
        count,
      });
    }

    results.push({
      icebergTable,
      table: resultTableName,
      count,
    });
  }

  return results;
}

export async function syncData(options: SyncOptions): Promise<SyncResult> {
  if (!options.warehouseSources.length) {
    throw new Error('warehouseSources must include at least one table.');
  }

  const sourceConnectionString = getSyncSourceConnectionString(options);
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;

  let connection: WarehouseSyncDuckdbConnection | undefined;
  let duckdbTempDir: string | undefined;
  try {
    // create a temporary directory for the DuckDB database
    duckdbTempDir = mkdtempSync(join(tmpdir(), `medplum-dw-sync-`));
    const duckdbDatabasePath = join(duckdbTempDir, 'warehouse.duckdb');
    const instance = await DuckDBInstance.create(duckdbDatabasePath);
    connection = await instance.connect();
    for (const q of options.destination.getSetupQueries(sourceConnectionString)) {
      await connection.run(q);
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
