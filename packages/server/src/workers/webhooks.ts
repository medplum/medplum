import { assertOk, BundleEntry, Extension, parseFhirPath, Resource, stringify, Subscription } from '@medplum/core';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';
import { URL } from 'url';
import { MedplumRedisConfig } from '../config';
import { repo } from '../fhir';
import { getSearchParameter, parseSearchUrl } from '../fhir/search';
import { logger } from '../logger';

export interface WebhookJobData {
  readonly resourceType: string;
  readonly id: string;
  readonly versionId: string;
}

const queueName = 'WebhookQueue';
const jobName = 'WebhookJobData';
let queue: Queue<WebhookJobData> | undefined = undefined;
let worker: Worker<WebhookJobData> | undefined = undefined;

/**
 * Initializes the webhook worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 */
export function initWebhookWorker(config: MedplumRedisConfig): void {
  const options: QueueBaseOptions = {
    connection: config
  };

  queue = new Queue<WebhookJobData>(queueName, options);
  worker = new Worker<WebhookJobData>(queueName, webhookProcessor, options);
  worker.on('completed', (job) => logger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => logger.info(`Failed job ${job.id} with ${err}`));
}

/**
 * Webhook job processor.
 * @param job BullMQ job definition.
 */
async function webhookProcessor(job: Job<WebhookJobData>): Promise<void> {
  try {
    await sendSubscriptions(job.data);
  } catch (ex) {
    logger.error(`Subscrition failed with ${ex}`);
  }
}

/**
 * Shuts down the webhook worker.
 * Closes the BullMQ job queue.
 * Clsoes the BullMQ worker.
 */
export async function closeWebhookWorker(): Promise<void> {
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
 * Adds a webhook job to the queue.
 * @param job The webhook job details.
 */
export function addWebhookJobData(job: WebhookJobData): void {
  if (queue) {
    queue.add(jobName, job);
  }
}

/**
 * Sends updates to all subscriptions for a resource that changed.
 * This should be called on both 'create' and 'update'.
 * Subscriptions are lazy-loaded once per repository.
 * @param resource The resource that changed.
 */
export async function sendSubscriptions(job: WebhookJobData): Promise<void> {
  const [outcome, resource] = await repo.readVersion(job.resourceType, job.id, job.versionId);
  assertOk(outcome);

  const subscriptions = await getSubscriptions();
  for (const subscription of subscriptions) {
    if (subscription.status !== 'active') {
      continue;
    }
    if (subscription.channel?.type === 'rest-hook') {
      sendRestHook(subscription, resource as Resource);
    }
  }
}

/**
 * Lazy loads the list of all subscriptions in this repository.
 * @returns The list of all subscriptions in this repository.
 */
async function getSubscriptions(): Promise<Subscription[]> {
  const [outcome, bundle] = await repo.search<Subscription>({ resourceType: 'Subscription' });
  assertOk(outcome);
  return (bundle?.entry as BundleEntry<Subscription>[]).map(e => e.resource as Subscription);
}

/**
 * Sends a rest hook to the subscription.
 * @param subscription The FHIR subscription resource.
 * @param resource The resource that changed.
 */
async function sendRestHook(subscription: Subscription, resource: Resource): Promise<void> {
  const url = subscription.channel?.endpoint;
  if (!url) {
    return;
  }

  const criteria = subscription.criteria;
  if (!criteria) {
    return;
  }

  const searchRequest = parseSearchUrl(new URL(criteria, 'https://api.medplum.com/'));
  if (resource.resourceType !== searchRequest.resourceType) {
    return;
  }

  if (searchRequest.filters) {
    for (const filter of searchRequest.filters) {
      const searchParam = getSearchParameter(searchRequest.resourceType, filter.code);
      if (searchParam) {
        const fhirPath = parseFhirPath(searchParam.expression as string);
        const values = fhirPath.eval(resource);
        const value = values.length > 0 ? values[0] : undefined;
        if (value !== filter.value) {
          return;
        }
      }
    }
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/fhir+json'
  };

  const body = stringify(resource);

  const secret = getExtensionValue(
    subscription,
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
