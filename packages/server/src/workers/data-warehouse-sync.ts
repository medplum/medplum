// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { S3TablesWarehouseDestination } from '../cloud/aws/data-warehouse-destination';
import type { MedplumServerConfig } from '../config/types';
import { getDataWarehouseConfigErrors, isDataWarehouseSyncOperational } from '../config/validate-config';
import { getWarehouseSyncPostgresTableNames, toIcebergTableName } from '../data-warehouse/config';
import { LocalParquetWarehouseDestination } from '../data-warehouse/destination';
import type { SyncOptions } from '../data-warehouse/sync';
import { syncData } from '../data-warehouse/sync';
import {
  acquireAdvisoryLock,
  DatabaseMode,
  getDatabasePool,
  locks,
  releaseAdvisoryLock,
  withPoolClient,
} from '../database';
import { globalLogger } from '../logger';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { addVerboseQueueLogging, getBullmqRedisConnectionOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

export interface DataWarehouseSyncJobData {
  trigger: 'scheduler';
}

export const DataWarehouseSyncQueueName = 'DataWarehouseSyncQueue';
export const DataWarehouseSyncSchedulerId = 'data-warehouse-sync';

/**
 * Default BullMQ lock duration for long-running warehouse sync jobs.
 *
 * This is useful because we want a high-frequency sync, but if it takes a long time,
 * BullMQ will assume the job is dead.  We alleviate this by job.updateProgress and this
 * increased default lock duration.
 */
export const DATA_WAREHOUSE_SYNC_LOCK_DURATION_MS = 5 * 60 * 1000;

export function logDataWarehouseSyncStatus(config: MedplumServerConfig): void {
  const syncConfig = config.dataWarehouse;
  if (!syncConfig?.enabled) {
    globalLogger.info('Data warehouse sync is disabled');
    return;
  }

  globalLogger.info('Data warehouse sync is enabled', {
    destination: syncConfig.destination,
    cron: syncConfig.cron,
  });
}

export const initDataWarehouseSyncWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  logDataWarehouseSyncStatus(config);

  if (options?.workerEnabled === false) {
    return { queue: undefined, worker: undefined, name: DataWarehouseSyncQueueName };
  }

  if (!isDataWarehouseSyncOperational(config)) {
    const errors = getDataWarehouseConfigErrors(config);
    if (errors.length > 0) {
      globalLogger.warn('Skipping data warehouse sync worker due to invalid configuration', { errors });
    }
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
      lockDuration: workerBullmq.lockDuration ?? DATA_WAREHOUSE_SYNC_LOCK_DURATION_MS,
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

  const errors = getDataWarehouseConfigErrors(config);
  if (errors.length > 0) {
    globalLogger.warn('Skipping data warehouse sync scheduler due to invalid configuration', { errors });
    try {
      await queue.removeJobScheduler(DataWarehouseSyncSchedulerId);
    } catch (err) {
      globalLogger.warn('Failed removing invalid data warehouse sync scheduler', { err });
    }
    return;
  }

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

  await withPoolClient(async (client) => {
    let hasLock = false;
    try {
      /*
       * for a DW sync job, it makes sense to skip on failure,
       * as it probably means there's already one in progress
       */

      hasLock = await acquireAdvisoryLock(client, locks.dataWarehouseSync, { maxAttempts: 1 });
      if (!hasLock) {
        globalLogger.info('Skipping data warehouse sync; another sync is in progress', {
          jobId: job.id,
          trigger: job.data.trigger,
        });
        return;
      }

      const syncOptions = getDataWarehouseSyncOptions(config);

      const result = await syncData({
        ...syncOptions,
        onProgress: async (message, metadata) => {
          globalLogger.info(message, metadata);
          await job.updateProgress({ message, ...metadata });
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
    } finally {
      if (hasLock) {
        await releaseAdvisoryLock(client, locks.dataWarehouseSync);
      }
    }
    /*
     * use the _writer_ database pool for the lock, even though we use the reader for sync,
     * as we can have many readers
     */
  }, getDatabasePool(DatabaseMode.WRITER));
}

export function getDataWarehouseSyncOptions(config: MedplumServerConfig): SyncOptions {
  const syncConfig = config.dataWarehouse;
  if (!syncConfig?.enabled) {
    throw new Error('dataWarehouse.enabled must be true to run scheduled sync');
  }

  const errors = getDataWarehouseConfigErrors(config);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  const { namespace, startDate } = syncConfig;

  // Fallback to the writer database when readonly is not configured.
  // For RDS Proxy, set host and ssl.require on the database config directly.
  const database = config.readonlyDatabase ?? config.database;

  const destination =
    (syncConfig.destination ?? 'local') === 'local'
      ? new LocalParquetWarehouseDestination(syncConfig.localBasePath as string)
      : new S3TablesWarehouseDestination(config.awsRegion, syncConfig.awsS3TableArn as string);

  const warehouseSources = getWarehouseSyncPostgresTableNames()
    .map((postgresTable) => ({
      postgresTable,
      icebergTable: toIcebergTableName(postgresTable),
    }))
    .toSorted((a, b) => a.icebergTable.localeCompare(b.icebergTable));
  return {
    database,
    destination,
    namespace,
    startDate,
    warehouseSources,
  };
}
