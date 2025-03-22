import { BackgroundJobContext, WithId } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { MedplumServerConfig } from '../config/types';
import { globalLogger } from '../logger';
import { closeBatchWorker, initBatchWorker } from './batch';
import { addCronJobs, closeCronWorker, initCronWorker } from './cron';
import { addDownloadJobs, closeDownloadWorker, initDownloadWorker } from './download';
import { closePostDeployMigrationWorker, initPostDeployMigrationWorker } from './post-deploy-migration';
import { closeReindexWorker, initReindexWorker } from './reindex';
import { addSubscriptionJobs, closeSubscriptionWorker, initSubscriptionWorker } from './subscription';
import { queueRegistry, WorkerInitializer } from './utils';

/**
 * Initializes all background workers.
 * @param config - The config to initialize the workers with. Should contain `redis` and optionally `bullmq` fields.
 */
export function initWorkers(config: MedplumServerConfig): void {
  globalLogger.debug('Initializing workers...');
  const initializers: WorkerInitializer[] = [
    initSubscriptionWorker,
    initDownloadWorker,
    initCronWorker,
    initReindexWorker,
    initBatchWorker,
    initPostDeployMigrationWorker,
  ];

  for (const initializer of initializers) {
    const { queue, name } = initializer(config);
    if (queueRegistry.getQueue(name)) {
      throw new Error(`Queue ${name} already registered`);
    }
    queueRegistry.addQueue(name, queue);
  }
  globalLogger.debug('Workers initialized');
}

/**
 * Shuts down all background workers.
 */
export async function closeWorkers(): Promise<void> {
  queueRegistry.clear();
  await closeSubscriptionWorker();
  await closeDownloadWorker();
  await closeCronWorker();
  await closeReindexWorker();
  await closeBatchWorker();
  await closePostDeployMigrationWorker();
}

/**
 * Adds all background jobs for a given resource.
 * @param resource - The resource that was created or updated.
 * @param previousVersion - The previous version of the resource, if available.
 * @param context - The background job context.
 */
export async function addBackgroundJobs(
  resource: WithId<Resource>,
  previousVersion: Resource | undefined,
  context: BackgroundJobContext
): Promise<void> {
  await addSubscriptionJobs(resource, previousVersion, context);
  await addDownloadJobs(resource);
  await addCronJobs(resource, previousVersion);
}
