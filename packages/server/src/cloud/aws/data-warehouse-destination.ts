// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { S3TablesClient } from '@aws-sdk/client-s3tables';
import type { WarehouseSourceTable } from '../../data-warehouse/config';
import type {
  DataWarehouseDestination,
  DataWarehouseDestinationType,
  DestinationQueryContext,
} from '../../data-warehouse/destination';
import type { DuckdbConnection } from '../../data-warehouse/warehouse-sql';
import {
  buildInsertIntoSelectQuery,
  buildManagedIcebergQualifiedTable,
  buildManagedIcebergSetupQueries,
  buildMaxLastUpdatedWatermarkPredicate,
  buildSelectFromHistoryTableQuery,
  runParameterizedWarehouseSql,
} from '../../data-warehouse/warehouse-sql';
import type { Expression } from '../../fhir/sql';
import { createS3TablesClient, tableExists } from './data-warehouse-client';

export class S3TablesWarehouseDestination implements DataWarehouseDestination {
  readonly type: DataWarehouseDestinationType = 's3tables';

  private readonly s3TablesClient: S3TablesClient;
  private readonly s3Region: string;
  private readonly awsS3TableArn: string;

  constructor(s3Region: string, awsS3TableArn: string) {
    this.s3Region = s3Region;
    this.awsS3TableArn = awsS3TableArn;
    this.s3TablesClient = createS3TablesClient(s3Region);
  }

  getSetupQueries(connectionString: string): string[] {
    return buildManagedIcebergSetupQueries({
      connectionString,
      s3Region: this.s3Region,
      awsS3TableArn: this.awsS3TableArn,
    });
  }

  async ensureTargetExists(tableSpec: WarehouseSourceTable, namespace: string): Promise<void> {
    const exists = await tableExists(this.s3TablesClient, this.awsS3TableArn, namespace, tableSpec.icebergTable);
    if (!exists) {
      throw new Error(
        `Managed Iceberg table does not exist: ${namespace}.${tableSpec.icebergTable}. Run migration before sync.`
      );
    }
  }

  buildSourcePredicate(tableSpec: WarehouseSourceTable, namespace: string): Expression {
    const qualifiedIceberg = buildManagedIcebergQualifiedTable(namespace, tableSpec.icebergTable);
    // Incremental sync: only Postgres rows newer than the latest row already in Iceberg.
    // When the Iceberg table is empty (or MAX is NULL), `lastUpdated > NULL` would be unknown for every row,
    // so we treat a NULL watermark as "no high-water mark" and include all source rows instead of a sentinel timestamp.
    return buildMaxLastUpdatedWatermarkPredicate(qualifiedIceberg);
  }

  async writeRows(connection: DuckdbConnection, context: DestinationQueryContext): Promise<number> {
    const qualifiedIceberg = buildManagedIcebergQualifiedTable(context.namespace, context.tableSpec.icebergTable);
    const projectedSelectQuery = buildSelectFromHistoryTableQuery(
      context.tableSpec.postgresTable,
      context.sourcePredicate
    );
    const insertQuery = buildInsertIntoSelectQuery(qualifiedIceberg, projectedSelectQuery);
    return runParameterizedWarehouseSql(connection, insertQuery);
  }

  getDestinationName(tableSpec: WarehouseSourceTable): string {
    return tableSpec.icebergTable;
  }
}
