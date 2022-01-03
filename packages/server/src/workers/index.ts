import { Resource } from '@medplum/fhirtypes';
import { MedplumRedisConfig } from '../config';
import { logger } from '../logger';
import { addDownloadJobs, closeDownloadWorker, initDownloadWorker } from './download';
import { addSubscriptionJobs, closeSubscriptionWorker, initSubscriptionWorker } from './subscription';

/**
 * Initializes all background workers.
 */
export function initWorkers(config: MedplumRedisConfig): void {
  logger.debug('Initializing workers...');
  initSubscriptionWorker(config);
  initDownloadWorker(config);
  logger.debug('Workers initialized');
}

/**
 * Shuts down all background workers.
 */
export async function closeWorkers(): Promise<void> {
  await closeSubscriptionWorker();
  await closeDownloadWorker();
}

/**
 * Adds all background jobs for a given resource.
 * @param resource The resource that was created or updated.
 */
export async function addBackgroundJobs(resource: Resource): Promise<void> {
  await addSubscriptionJobs(resource);
  await addDownloadJobs(resource);
}
