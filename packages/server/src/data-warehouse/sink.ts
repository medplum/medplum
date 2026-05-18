// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WarehouseSourceTable } from './config';
import {
  buildCopySelectToParquetQuery,
  buildDuckdbPostgresAttachQuery,
  buildProjectedSelectFromHistoryTable,
} from './warehouse-sql';

export type DataWarehouseSinkType = 's3tables' | 'local';

export interface DuckdbConnectionForSink {
  run(query: string): Promise<unknown>;
}

export interface SinkQueryContext {
  tableSpec: WarehouseSourceTable;
  namespace: string;
  sourcePredicate: string;
}

export interface DataWarehouseSink {
  readonly type: DataWarehouseSinkType;
  getSetupQueries(connectionString: string): string[];
  ensureTargetExists(tableSpec: WarehouseSourceTable, namespace: string): Promise<void>;
  buildSourcePredicate(tableSpec: WarehouseSourceTable, namespace: string): string;
  writeRows(connection: DuckdbConnectionForSink, context: SinkQueryContext): Promise<void>;
  /**
   * For local sinks, use the path to the Parquet file
   * For Iceberg, you'll use the Iceberg table name
   */
  getDestinationName(tableSpec: WarehouseSourceTable): string;
}

export class LocalParquetWarehouseSink implements DataWarehouseSink {
  readonly type: DataWarehouseSinkType = 'local';
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  getSetupQueries(connectionString: string): string[] {
    return ['INSTALL postgres;', 'LOAD postgres;', buildDuckdbPostgresAttachQuery(connectionString)];
  }

  async ensureTargetExists(_tableSpec: WarehouseSourceTable, _namespace: string): Promise<void> {
    mkdirSync(this.basePath, { recursive: true });
  }

  buildSourcePredicate(_tableSpec: WarehouseSourceTable, _namespace: string): string {
    /* TODO: Support incremental local sync by deriving a watermark from existing parquet output.
     * For now we always export all source rows because the local sink does not yet read prior parquet state.
     */
    return 'TRUE';
  }

  async writeRows(connection: DuckdbConnectionForSink, context: SinkQueryContext): Promise<void> {
    const parquetPath = this.getParquetPathForTable(context.tableSpec);
    const projectedSelect = buildProjectedSelectFromHistoryTable(
      context.tableSpec.postgresTable,
      context.sourcePredicate
    );
    await connection.run(buildCopySelectToParquetQuery(projectedSelect, parquetPath));
  }

  getDestinationName(tableSpec: WarehouseSourceTable): string {
    return this.getParquetPathForTable(tableSpec);
  }

  private getParquetPathForTable(tableSpec: WarehouseSourceTable): string {
    return join(this.basePath, `${tableSpec.icebergTable}.parquet`);
  }
}
