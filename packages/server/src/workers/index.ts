import { Resource } from '@medplum/fhirtypes';
import { MedplumRedisConfig } from '../config';
import { logger } from '../logger';
import { addDownloadJobs, closeDownloadWorker, initDownloadWorker } from './download';
import { addSubscriptionJobs, closeSubscriptionWorker, initSubscriptionWorker } from './subscription';

/**
 * Initializes the subscription worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 */
export function initWorkers(config: MedplumRedisConfig): void {
  logger.debug('Initializing workers...');
  initSubscriptionWorker(config);
  initDownloadWorker(config);
  logger.debug('Workers initialized');
}

/**
 * Shuts down the subscription worker.
 * Closes the BullMQ scheduler.
 * Closes the BullMQ job queue.
 * Clsoes the BullMQ worker.
 */
export async function closeWorkers(): Promise<void> {
  await closeSubscriptionWorker();
  await closeDownloadWorker();
}

/**
 * Adds all subscription jobs for a given resource.
 *
 * There are a few important structural considerations:
 * 1) One resource change can spawn multiple subscription jobs.
 * 2) Subscription jobs can fail, and must be retried independently.
 * 3) Subscriptions should be evaluated at the time of the resource change.
 *
 * So, when a resource changes (create or update), we evaluate all subscriptions
 * at that moment in time.  For each matching subscription, we enqueue the job.
 * The only purpose of the job is to make the outbound HTTP request,
 * not to re-evaluate the subscription.
 *
 * @param resource The resource that was created or updated.
 */
export async function addBackgroundJobs(resource: Resource): Promise<void> {
  await addSubscriptionJobs(resource);
  await addDownloadJobs(resource);
}
