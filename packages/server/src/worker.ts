import { assertOk, BundleEntry, Extension, Resource, stringify, Subscription } from '@medplum/core';
import { Job, Queue, Worker } from 'bullmq';
import { createHmac } from 'crypto';
import fetch from 'node-fetch';
import { repo } from './fhir';
import { logger } from './logger';

const queueName = 'WebhookQueue';
const jobName = 'WebhookJob';

export interface WebhookJob {
  readonly resourceType: string;
  readonly id: string;
  readonly versionId: string;
}

// export const queue = new Queue<WebhookJob>(queueName);

let queue: Queue<WebhookJob> | undefined = undefined;
let worker: Worker<WebhookJob> | undefined = undefined;

export function initWorker(): void {
  queue = new Queue<WebhookJob>(queueName);

  worker = new Worker<WebhookJob>(queueName, async (job: Job<WebhookJob>) => {
    try {
      await sendSubscriptions(job.data);
    } catch (ex) {
      logger.error(`Subscrition failed with ${ex}`);
      console.log(JSON.stringify(job.data, undefined, 2));
    }
  });
  worker.on('completed', (job) => logger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => logger.info(`Failed job ${job.id} with ${err}`));
}

export async function closeWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = undefined;
  }
}

export function addJob(job: WebhookJob): void {
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
async function sendSubscriptions(job: WebhookJob): Promise<void> {
  const [outcome, resource] = await repo.readVersion(job.resourceType, job.id, job.versionId);
  assertOk(outcome);

  const subscriptions = await getSubscriptions();
  for (const subscription of subscriptions) {
    switch (subscription.channel?.type) {
      case 'rest-hook':
        sendRestHook(subscription, resource as Resource);
        break;
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
