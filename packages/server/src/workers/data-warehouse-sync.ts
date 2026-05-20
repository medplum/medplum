// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { S3TablesWarehouseDestination } from '../cloud/aws/data-warehouse-destination';
import type { MedplumServerConfig } from '../config/types';
import { validateDataWarehouseConfig } from '../config/validate-config';
import { getWarehouseSyncPostgresTableNames, toIcebergTableName } from '../data-warehouse/config';
import { LocalParquetWarehouseDestination } from '../data-warehouse/destination';
import type { SyncOptions } from '../data-warehouse/sync';
import { syncData } from '../data-warehouse/sync';
import { globalLogger } from '../logger';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { addVerboseQueueLogging, getBullmqRedisConnectionOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

export interface DataWarehouseSyncJobData {
  trigger: 'scheduler';
}

export const DataWarehouseSyncQueueName = 'DataWarehouseSyncQueue';
export const DataWarehouseSyncSchedulerId = 'data-warehouse-sync';

export const initDataWarehouseSyncWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  /*
   Only initialize the worker if it is enabled.
   otherwise, quit fast
  */
  if (options?.workerEnabled === false) {
    return { queue: undefined, worker: undefined, name: DataWarehouseSyncQueueName };
  }

  const defaultOptions: QueueBaseOptions = {
    connection: getBullmqRedisConnectionOptions(config),
  };

  const queue = new Queue<DataWarehouseSyncJobData>(DataWarehouseSyncQueueName, {
    ...defaultOptions,
    defaultJobOptions: { attempts: 1 },
  });

  const workerBullmq = getWorkerBullmqConfig(config, 'data-warehouse-sync') ?? {};
  const worker = new Worker<DataWarehouseSyncJobData>(
    DataWarehouseSyncQueueName,
    async (job) => processDataWarehouseSyncJob(config, job),
    {
      ...defaultOptions,
      ...workerBullmq,
      // Data warehouse sync is intentionally serialized.
      concurrency: 1,
    }
  );
  addVerboseQueueLogging<DataWarehouseSyncJobData>(queue, worker, (job) => ({
    trigger: job.data.trigger,
  }));

  refreshDataWarehouseSyncScheduler(config, queue).catch((err) => {
    globalLogger.error('Failed to refresh data warehouse sync scheduler', { err });
  });

  return { queue, worker, name: DataWarehouseSyncQueueName };
};

export function getDataWarehouseSyncQueue(): Queue<DataWarehouseSyncJobData> | undefined {
  return queueRegistry.get(DataWarehouseSyncQueueName);
}

export async function refreshDataWarehouseSyncScheduler(
  config: MedplumServerConfig,
  queue: Queue<DataWarehouseSyncJobData>
): Promise<void> {
  const syncConfig = config.dataWarehouse;
  if (!syncConfig?.enabled) {
    try {
      await queue.removeJobScheduler(DataWarehouseSyncSchedulerId);
    } catch (err) {
      globalLogger.warn('Failed removing disabled data warehouse sync scheduler', { err });
    }
    return;
  }

  validateDataWarehouseConfig(config);

  await queue.upsertJobScheduler(
    DataWarehouseSyncSchedulerId,
    {
      pattern: syncConfig.cron,
    },
    {
      data: { trigger: 'scheduler' },
    }
  );
}

export async function processDataWarehouseSyncJob(
  config: MedplumServerConfig,
  job: Job<DataWarehouseSyncJobData>
): Promise<void> {
  const syncConfig = config.dataWarehouse;
  try {
    const syncOptions = getDataWarehouseSyncOptions(config);

    const result = await syncData({
      ...syncOptions,
      onProgress: (message, metadata) => {
        globalLogger.info(message, metadata);
      },
    });

    const inserted = result.resources.filter((resource) => resource.count > 0).length;
    const skipped = result.resources.length - inserted;
    globalLogger.info('Data warehouse sync completed', { inserted, skipped, total: result.resources.length });
  } catch (err) {
    globalLogger.error('Data warehouse sync failed', {
      jobId: job.id,
      trigger: job.data.trigger,
      destination: syncConfig?.destination,
      namespace: syncConfig?.namespace,
      err,
    });
    throw err;
  }
}

export function getDataWarehouseSyncOptions(config: MedplumServerConfig): SyncOptions {
  const syncConfig = config.dataWarehouse;
  if (!syncConfig?.enabled) {
    throw new Error('dataWarehouse.enabled must be true to run scheduled sync');
  }

  validateDataWarehouseConfig(config);
  const { namespace } = syncConfig;

  // Fallback to the writer database when readonly is not configured.
  // For RDS Proxy, set host and ssl.require on the database config directly.
  const database = config.readonlyDatabase ?? config.database;

  const destination =
    (syncConfig.destination ?? 'local') === 'local'
      ? new LocalParquetWarehouseDestination(syncConfig.localBasePath as string)
      : new S3TablesWarehouseDestination(config.awsRegion, syncConfig.awsS3TableArn as string);

  const warehouseSources = getWarehouseSyncPostgresTableNames().map((postgresTable) => ({
    postgresTable,
    icebergTable: toIcebergTableName(postgresTable),
  }));
  return {
    database,
    destination,
    namespace,
    warehouseSources,
  };
}
