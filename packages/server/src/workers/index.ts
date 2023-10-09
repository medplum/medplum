import { Resource } from '@medplum/fhirtypes';
import { MedplumBullmqConfig, MedplumRedisConfig } from '../config';
import { globalLogger } from '../logger';
import { BackgroundJobContext } from './context';
import { addCronJobs, closeCronWorker, initCronWorker } from './cron';
import { addDownloadJobs, closeDownloadWorker, initDownloadWorker } from './download';
import { addSubscriptionJobs, closeSubscriptionWorker, initSubscriptionWorker } from './subscription';

/**
 * Initializes all background workers.
 * @param redisConfig The Redis config.
 * @param bullmqConfig The BullMQ config.
 */
export function initWorkers(redisConfig: MedplumRedisConfig, bullmqConfig?: MedplumBullmqConfig): void {
  globalLogger.debug('Initializing workers...');
  initSubscriptionWorker(redisConfig, bullmqConfig);
  initDownloadWorker(redisConfig, bullmqConfig);
  initCronWorker(redisConfig, bullmqConfig);
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
 * @param resource The resource that was created or updated.
 * @param context The background job context.
 */
export async function addBackgroundJobs(resource: Resource, context: BackgroundJobContext): Promise<void> {
  await addSubscriptionJobs(resource, context);
  await addDownloadJobs(resource);
  await addCronJobs(resource);
}
