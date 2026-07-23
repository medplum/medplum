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
  buildDuckdbPostgresAttachQuery,
  buildInsertIntoSelectQuery,
  buildManagedIcebergQualifiedTable,
  buildManagedIcebergSetupQueries,
  buildSelectFromHistoryTableQuery,
  fetchIcebergWatermark,
  runParameterizedWarehouseSql,
} from '../../data-warehouse/warehouse-sql';
import type { Expression } from '../../fhir/sql';
import { Condition } from '../../fhir/sql';
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

  getSetupQueries(): string[] {
    return buildManagedIcebergSetupQueries({
      s3Region: this.s3Region,
      awsS3TableArn: this.awsS3TableArn,
    });
  }

  /*
   * DuckDB session settings for managed Iceberg sync connections.
   *
   * These are connection-scoped (`SET` without `GLOBAL`) and must run on every
   * DuckDB connection that reads or writes Iceberg / Postgres.
   */
  getConnectionSetupQueries(): string[] {
    return [
      /*
       * the default is 524288, which can take a LOT of memory since we're copying
       * JSON content data
       */
      'SET partitioned_write_flush_threshold = 10000;',
      /*
       * Misleading option.  This is to allow duckdb to insert into a "sorted table", which is really a hint anyway.
       * https://github.com/duckdb/duckdb-iceberg/issues/851
       * https://github.com/duckdb/duckdb-iceberg/pull/992
       */
      'SET unsafe_iceberg_ignore_sort_order=true',
      /*
       * See https://duckdb.org/docs/current/core_extensions/postgres/connection_pool
       * the default connection pool settings are very aggressive; many connections, much parallelism
       * That's not what we want for a sync process on a timer; we want to be gentle on our reader instances
       */
      'SET threads = 1',
      'SET pg_use_ctid_scan = false',
    ];
  }

  getPostgresAttachQueries(connectionString: string): string[] {
    return [buildDuckdbPostgresAttachQuery(connectionString)];
  }

  async ensureTargetExists(tableSpec: WarehouseSourceTable, namespace: string): Promise<void> {
    const exists = await tableExists(this.s3TablesClient, this.awsS3TableArn, namespace, tableSpec.icebergTable);
    if (!exists) {
      throw new Error(
        `Managed Iceberg table does not exist: ${namespace}.${tableSpec.icebergTable}. Run migration before sync.`
      );
    }
  }

  async buildSourcePredicate(
    connection: DuckdbConnection,
    tableSpec: WarehouseSourceTable,
    namespace: string
  ): Promise<Expression | undefined> {
    const qualifiedIceberg = buildManagedIcebergQualifiedTable(namespace, tableSpec.icebergTable);
    const watermark = await fetchIcebergWatermark(connection, qualifiedIceberg);
    if (!watermark) {
      return undefined;
    }

    return new Condition('lastUpdated', '>', watermark);
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
