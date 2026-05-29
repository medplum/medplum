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
  getSetupQueries(connectionString: string): string[];
  ensureTargetExists(tableSpec: WarehouseSourceTable, namespace: string): Promise<void>;
  buildSourcePredicate(tableSpec: WarehouseSourceTable, namespace: string): Expression | undefined;
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

  getSetupQueries(connectionString: string): string[] {
    return ['INSTALL postgres', 'LOAD postgres', buildDuckdbPostgresAttachQuery(connectionString)];
  }

  async ensureTargetExists(_tableSpec: WarehouseSourceTable, _namespace: string): Promise<void> {
    mkdirSync(this.basePath, { recursive: true });
  }

  buildSourcePredicate(_tableSpec: WarehouseSourceTable, _namespace: string): undefined {
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
