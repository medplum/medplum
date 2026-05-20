// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumServerConfig } from '../../config/types';
import { globalLogger } from '../../logger';
import { createS3TablesClient, ensureNamespaceExists, ensureWarehouseHistoryIcebergTable } from './s3-tables-client';
import {
  DEFAULT_WAREHOUSE_NAMESPACE,
  getWarehouseSyncPostgresTableNames,
  resolveWarehouseSourcesFromPostgresTableNames,
} from './warehouse-table-names';

const PROVISION_CONCURRENCY = 8;

/** Narrow config slice expected once `dataWarehouse` is introduced by server config (separate feature PR). */
export interface DataWarehouseConfigSlice {
  enabled?: boolean;
  sink?: 's3tables' | 'local';
  awsS3TableArn?: string;
  namespace?: string;
  cron?: string;
  localBasePath?: string;
}

type ServerConfigWithOptionalWarehouse = MedplumServerConfig & { dataWarehouse?: DataWarehouseConfigSlice };

/**
 * After Postgres schema migrations, provision managed S3 Tables Iceberg namespaces and `_History` tables
 * required by the data warehouse sync worker. Idempotent; skipped when `database.runMigrations` is false,
 * `dataWarehouse` is absent/disabled, or sink is `local`.
 *
 * @param serverConfig - Loaded Medplum server configuration (may include optional `dataWarehouse` from a future PR).
 */
export async function runS3TablesWarehouseMigrationsIfNeeded(serverConfig: MedplumServerConfig): Promise<void> {
  const config = serverConfig as ServerConfigWithOptionalWarehouse;
  const dw = config.dataWarehouse;
  if (!dw?.enabled) {
    return;
  }

  if (!dw.cron?.trim()) {
    throw new Error('dataWarehouse.cron is required when dataWarehouse.enabled is true');
  }

  const sink = dw.sink ?? 's3tables';
  if (sink !== 's3tables' && sink !== 'local') {
    throw new Error('dataWarehouse.sink must be "s3tables" or "local"');
  }
  if (sink === 'local') {
    return;
  }

  const tableBucketArn = dw.awsS3TableArn;
  if (!tableBucketArn?.trim()) {
    throw new Error('dataWarehouse.awsS3TableArn is required when dataWarehouse.sink is "s3tables"');
  }

  const namespace = dw.namespace?.trim() || DEFAULT_WAREHOUSE_NAMESPACE;
  const client = createS3TablesClient(config.awsRegion);

  await ensureNamespaceExists(client, tableBucketArn, namespace);

  const sources = resolveWarehouseSourcesFromPostgresTableNames(getWarehouseSyncPostgresTableNames());
  const started = Date.now();
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < sources.length; i += PROVISION_CONCURRENCY) {
    const slice = sources.slice(i, i + PROVISION_CONCURRENCY);
    const results = await Promise.all(
      slice.map((spec) => ensureWarehouseHistoryIcebergTable(client, tableBucketArn, namespace, spec.icebergTable))
    );
    for (const r of results) {
      if (r === 'created') {
        created++;
      } else {
        skipped++;
      }
    }
  }

  globalLogger.info('S3 Tables warehouse tables ensured', {
    namespace,
    tables: sources.length,
    created,
    skipped,
    durationMs: Date.now() - started,
  });
}
