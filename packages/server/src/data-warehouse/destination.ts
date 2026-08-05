// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Expression } from '../fhir/sql';
import type { WarehouseSourceTable } from './config';
import type { DuckdbConnection } from './warehouse-sql';
import {
  buildCopySelectToParquetQuery,
  buildDuckdbPostgresAttachQuery,
  buildProjectedSelectFromHistoryTable,
  runParameterizedWarehouseSql,
} from './warehouse-sql';

export type DataWarehouseDestinationType = 's3tables' | 'local';

export interface DestinationQueryContext {
  tableSpec: WarehouseSourceTable;
  namespace: string;
  sourcePredicate?: Expression;
}

export interface DataWarehouseDestination {
  readonly type: DataWarehouseDestinationType;
  /**
   * DuckDB instance setup (extensions, secrets, ATTACH) that does not require Postgres.
   * Run once per DuckDB instance; shared by later connections from that instance.
   */
  getSetupQueries(): string[];
  /**
   * DuckDB session settings (`SET ...`) that are connection-scoped.
   * Run on every connection opened from the instance.
   */
  getConnectionSetupQueries(): string[];
  /**
   * ATTACH Postgres is DuckDB's way of connecting to a database. run after all destination-side state (e.g. watermarks) has been resolved,
   * It is intentionally not done at the beginning of sync because we want to avoid
   * any potential idle-connection issues while watermarks from Icebergare are being read.
   */
  getPostgresAttachQueries(connectionString: string): string[];
  /**
   * Verifies (or creates) the destination target for a source table.
   * Called per table during watermark collection, before reading that table's watermark.
   */
  ensureTargetExists(tableSpec: WarehouseSourceTable, namespace: string): Promise<void>;
  buildSourcePredicate(
    connection: DuckdbConnection,
    tableSpec: WarehouseSourceTable,
    namespace: string
  ): Promise<Expression | undefined>;
  writeRows(connection: DuckdbConnection, context: DestinationQueryContext): Promise<number>;
  /**
   * For local destinations, use the path to the Parquet file
   * For Iceberg, you'll use the Iceberg table name
   */
  getDestinationName(tableSpec: WarehouseSourceTable): string;
}

export class LocalParquetWarehouseDestination implements DataWarehouseDestination {
  readonly type: DataWarehouseDestinationType = 'local';
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  getSetupQueries(): string[] {
    return [];
  }

  getConnectionSetupQueries(): string[] {
    return [];
  }

  getPostgresAttachQueries(connectionString: string): string[] {
    return ['INSTALL postgres', 'LOAD postgres', buildDuckdbPostgresAttachQuery(connectionString)];
  }

  async ensureTargetExists(_tableSpec: WarehouseSourceTable, _namespace: string): Promise<void> {
    mkdirSync(this.basePath, { recursive: true });
  }

  async buildSourcePredicate(
    _connection: DuckdbConnection,
    _tableSpec: WarehouseSourceTable,
    _namespace: string
  ): Promise<undefined> {
    /* TODO: Support incremental local sync by deriving a watermark from existing parquet output.
     * For now we always export all source rows because the local destination does not yet read prior parquet state.
     */
    return undefined;
  }

  async writeRows(connection: DuckdbConnection, context: DestinationQueryContext): Promise<number> {
    const parquetPath = this.getParquetPathForTable(context.tableSpec);
    const projectedSelect = buildProjectedSelectFromHistoryTable(
      context.tableSpec.postgresTable,
      context.sourcePredicate
    );
    return runParameterizedWarehouseSql(connection, buildCopySelectToParquetQuery(projectedSelect, parquetPath));
  }

  getDestinationName(tableSpec: WarehouseSourceTable): string {
    return this.getParquetPathForTable(tableSpec);
  }

  private getParquetPathForTable(tableSpec: WarehouseSourceTable): string {
    return join(this.basePath, `${tableSpec.icebergTable}.parquet`);
  }
}
