import { BackgroundJobContext, WithId } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { MedplumServerConfig } from '../config/types';
import { globalLogger } from '../logger';
import { initBatchWorker } from './batch';
import { addCronJobs, initCronWorker } from './cron';
import { addDownloadJobs, initDownloadWorker } from './download';
import { initPostDeployMigrationWorker } from './post-deploy-migration';
import { initReindexWorker } from './reindex';
import { addSubscriptionJobs, initSubscriptionWorker } from './subscription';
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
    const { name, queue, worker } = initializer(config);
    queueRegistry.add(name, queue, worker);
  }
  globalLogger.debug('Workers initialized');
}

/**
 * Shuts down all background workers.
 */
export async function closeWorkers(): Promise<void> {
  await Promise.all(queueRegistry.closeAll());
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
  await addDownloadJobs(resource, context);
  await addCronJobs(resource, previousVersion, context);
}
