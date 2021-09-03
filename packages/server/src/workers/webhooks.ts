import { assertOk, BundleEntry, Extension, Filter, Operator, parseFhirPath, Resource, SearchRequest, stringify, Subscription } from '@medplum/core';
import { Job, Queue, QueueBaseOptions, QueueScheduler, Worker } from 'bullmq';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';
import { URL } from 'url';
import { MedplumRedisConfig } from '../config';
import { repo } from '../fhir';
import { getSearchParameter, parseSearchUrl } from '../fhir/search';
import { logger } from '../logger';

export interface WebhookJobData {
  readonly subscriptionId: string;
  readonly resourceType: string;
  readonly id: string;
  readonly versionId: string;
}

const queueSchedulerName = 'WebhookQueueScheduler';
const queueName = 'WebhookQueue';
const jobName = 'WebhookJobData';
let queueScheduler: QueueScheduler | undefined = undefined;
let queue: Queue<WebhookJobData> | undefined = undefined;
let worker: Worker<WebhookJobData> | undefined = undefined;

/**
 * Initializes the webhook worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 */
export function initWebhookWorker(config: MedplumRedisConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config
  };

  queueScheduler = new QueueScheduler(queueSchedulerName, defaultOptions);

  queue = new Queue<WebhookJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 18, // 1 second * 2^18 = 73 hours
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  });

  worker = new Worker<WebhookJobData>(queueName, webhookProcessor, defaultOptions);
  worker.on('completed', (job) => logger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => logger.info(`Failed job ${job.id} with ${err}`));
}

/**
 * Webhook job processor.
 * @param job BullMQ job definition.
 */
export async function webhookProcessor(job: Job<WebhookJobData>): Promise<void> {
  logger.debug(`Webhook processor job ${job.id}`);
  try {
    await sendWebhook(job.data);
  } catch (ex) {
    logger.error(`Subscrition failed with ${ex}`);
  }
}

/**
 * Shuts down the webhook worker.
 * Closes the BullMQ scheduler.
 * Closes the BullMQ job queue.
 * Clsoes the BullMQ worker.
 */
export async function closeWebhookWorker(): Promise<void> {
  if (queueScheduler) {
    await queueScheduler.close();
    queueScheduler = undefined;
  }

  if (queue) {
    await queue.close();
    queue = undefined;
  }

  if (worker) {
    await worker.close();
    worker = undefined;
  }
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
export async function addSubscriptionJobs(resource: Resource): Promise<void> {
  const subscriptions = await getSubscriptions();
  logger.debug(`Evaluate ${subscriptions.length} subscription(s)`);
  for (const subscription of subscriptions) {
    if (matchesCriteria(resource, subscription)) {
      addWebhookJobData({
        subscriptionId: subscription.id as string,
        resourceType: resource.resourceType,
        id: resource.id as string,
        versionId: resource.meta?.versionId as string
      });
    }
  }
}

/**
 * Determines if the resource matches the subscription criteria.
 * @param resource The resource that was created or updated.
 * @param subscription The subscription.
 * @returns True if the resource matches the subscription criteria.
 */
function matchesCriteria(resource: Resource, subscription: Subscription): boolean {
  if (resource.meta?.project !== subscription.meta?.project) {
    logger.debug('Ignore resource in different project');
    return false;
  }

  if (subscription.channel?.type !== 'rest-hook') {
    logger.debug('Ignore non-webhook subscription');
    return false;
  }

  const url = subscription.channel?.endpoint;
  if (!url) {
    logger.debug(`Ignore rest hook missing URL`);
    return false;
  }

  const criteria = subscription.criteria;
  if (!criteria) {
    logger.debug(`Ignore rest hook missing criteria`);
    return false;
  }

  const searchRequest = parseSearchUrl(new URL(criteria, 'https://api.medplum.com/'));
  if (resource.resourceType !== searchRequest.resourceType) {
    logger.debug(`Ignore rest hook for different resourceType (wanted "${searchRequest.resourceType}", received "${resource.resourceType}")`);
    return false;
  }

  return matchesSearchRequest(resource, searchRequest);
}

/**
 * Determines if the resource matches the search request.
 * @param resource The resource that was created or updated.
 * @param searchRequest The subscription criteria as a search request.
 * @returns True if the resource satisfies the search request.
 */
function matchesSearchRequest(resource: Resource, searchRequest: SearchRequest): boolean {
  if (searchRequest.filters) {
    for (const filter of searchRequest.filters) {
      if (!matchesSearchFilter(resource, searchRequest, filter)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Determines if the resource matches the search filter.
 * @param resource The resource that was created or updated.
 * @param filter One of the filters of a subscription criteria.
 * @returns True if the resource satisfies the search filter.
 */
function matchesSearchFilter(resource: Resource, searchRequest: SearchRequest, filter: Filter): boolean {
  const searchParam = getSearchParameter(searchRequest.resourceType, filter.code);
  if (searchParam) {
    const fhirPath = parseFhirPath(searchParam.expression as string);
    const values = fhirPath.eval(resource);
    const value = values.length > 0 ? values[0] : undefined;
    if (value !== filter.value) {
      logger.debug(`Ignore rest hook for filter value (wanted "${filter.value}", received "${value})"`);
      return false;
    }
  }
  return true;
}

/**
 * Adds a webhook job to the queue.
 * @param job The webhook job details.
 */
function addWebhookJobData(job: WebhookJobData): void {
  logger.debug(`Adding Webhook job`);
  if (queue) {
    queue.add(jobName, job);
  } else {
    logger.debug(`Webhook queue not initialized`);
  }
}

/**
 * Loads the list of all subscriptions in this repository.
 * @returns The list of all subscriptions in this repository.
 */
async function getSubscriptions(): Promise<Subscription[]> {
  const [outcome, bundle] = await repo.search<Subscription>({
    resourceType: 'Subscription',
    filters: [{
      code: 'status',
      operator: Operator.EQUALS,
      value: 'active'
    }]
  });
  assertOk(outcome);
  return (bundle?.entry as BundleEntry<Subscription>[]).map(e => e.resource as Subscription);
}

/**
 * Sends a rest hook to the subscription.
 * @param subscription The FHIR subscription resource.
 * @param resource The resource that changed.
 */
async function sendWebhook(jobData: WebhookJobData): Promise<void> {
  const { subscriptionId, resourceType, id, versionId } = jobData;

  const [subscriptionOutcome, subscription] = await repo.readResource<Subscription>('Subscription', subscriptionId);
  assertOk(subscriptionOutcome);

  const [resourceOutcome, resource] = await repo.readVersion(resourceType, id, versionId);
  assertOk(resourceOutcome);

  const url = subscription?.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    logger.debug(`Ignore rest hook missing URL`);
    return;
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/fhir+json'
  };

  const body = stringify(resource);

  const secret = getExtensionValue(
    subscription as Subscription,
    'https://www.medplum.com/fhir/StructureDefinition-subscriptionSecret');

  if (secret) {
    headers['X-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
  }

  logger.info('Sending rest hook to: ' + url);
  try {
    const response = await fetch(url, { method: 'POST', headers, body });
    logger.info('Received rest hook status: ' + response.status);

  } catch (error) {
    logger.info('Webhook error: ' + error);
    throw error;
  }
}

/**
 * Returns an extension value by extension URLs.
 * @param resource The base resource.
 * @param urls Array of extension URLs.  Each entry represents a nested extension.
 * @returns The extension value if found; undefined otherwise.
 */
function getExtensionValue(resource: Resource, ...urls: string[]): string | undefined {
  // Let curr be the current resource or extension. Extensions can be nested.
  let curr: any = resource;

  // For each of the urls, try to find a matching nested extension.
  for (let i = 0; i < urls.length && curr; i++) {
    curr = (curr?.extension as Extension[] | undefined)?.find(e => e.url === urls[i]);
  }

  return curr?.valueString as string | undefined;
}
