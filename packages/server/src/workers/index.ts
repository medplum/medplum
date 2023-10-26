import { Resource } from '@medplum/fhirtypes';
import { MedplumServerConfig } from '../config';
import { globalLogger } from '../logger';
import { BackgroundJobContext } from './context';
import { addCronJobs, closeCronWorker, initCronWorker } from './cron';
import { addDownloadJobs, closeDownloadWorker, initDownloadWorker } from './download';
import { addSubscriptionJobs, closeSubscriptionWorker, initSubscriptionWorker } from './subscription';

/**
 * Initializes all background workers.
 * @param config - The config to initialize the workers with. Should contain `redis` and optionally `bullmq` fields.
 */
export function initWorkers(config: MedplumServerConfig): void {
  globalLogger.debug('Initializing workers...');
  initSubscriptionWorker(config);
  initDownloadWorker(config);
  initCronWorker(config);
  globalLogger.debug('Workers initialized');
}

/**
 * Shuts down all background workers.
 */
export async function closeWorkers(): Promise<void> {
  await closeSubscriptionWorker();
  await closeDownloadWorker();
  await closeCronWorker();
}

/**
 * Adds all background jobs for a given resource.
 * @param resource - The resource that was created or updated.
 * @param context - The background job context.
 */
export async function addBackgroundJobs(resource: Resource, context: BackgroundJobContext): Promise<void> {
  await addSubscriptionJobs(resource, context);
  await addDownloadJobs(resource);
  await addCronJobs(resource);
}
