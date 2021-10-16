import { assertOk, AuditEvent, Bot, BundleEntry, createReference, Extension, Filter, Operator, parseFhirPath, Resource, SearchRequest, stringify, Subscription } from '@medplum/core';
import { Job, Queue, QueueBaseOptions, QueueScheduler, Worker } from 'bullmq';
import { createHmac } from 'crypto';
import fetch, { HeadersInit } from 'node-fetch';
import { URL } from 'url';
import vm from 'vm';
import { MedplumRedisConfig } from '../config';
import { repo, Repository } from '../fhir';
import { getSearchParameter, parseSearchUrl } from '../fhir/search';
import { logger } from '../logger';

export interface SubscriptionJobData {
  readonly subscriptionId: string;
  readonly resourceType: string;
  readonly id: string;
  readonly versionId: string;
}

/**
 * AuditEvent outcome code.
 * See: https://www.hl7.org/fhir/valueset-audit-event-outcome.html
 */
enum AuditEventOutcome {
  Success = '0',
  MinorFailure = '4',
  SeriousFailure = '8',
  MajorFailure = '12'
}

const queueName = 'SubscriptionQueue';
const jobName = 'SubscriptionJobData';
let queueScheduler: QueueScheduler | undefined = undefined;
let queue: Queue<SubscriptionJobData> | undefined = undefined;
let worker: Worker<SubscriptionJobData> | undefined = undefined;

/**
 * Initializes the subscription worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 */
export function initSubscriptionWorker(config: MedplumRedisConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config
  };

  queueScheduler = new QueueScheduler(queueName, defaultOptions);

  queue = new Queue<SubscriptionJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 18, // 1 second * 2^18 = 73 hours
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  });

  worker = new Worker<SubscriptionJobData>(queueName, sendSubscription, defaultOptions);
  worker.on('completed', (job) => logger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => logger.info(`Failed job ${job.id} with ${err}`));
}

/**
 * Shuts down the subscription worker.
 * Closes the BullMQ scheduler.
 * Closes the BullMQ job queue.
 * Clsoes the BullMQ worker.
 */
export async function closeSubscriptionWorker(): Promise<void> {
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
      addSubscriptionJobData({
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

  if (!matchesChannelType(subscription)) {
    logger.debug(`Ignore subscription without recognized channel type`);
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
 * Returns true if the subscription channel type is ok to execute.
 * @param subscription The subscription resource.
 * @returns True if the subscription channel type is ok to execute.
 */
function matchesChannelType(subscription: Subscription): boolean {
  const channelType = subscription.channel?.type;

  if (channelType === 'rest-hook') {
    const url = subscription.channel?.endpoint;
    if (!url) {
      logger.debug(`Ignore rest-hook missing URL`);
      return false;
    }

    return true;
  }

  return false;
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
 * Adds a subscription job to the queue.
 * @param job The subscription job details.
 */
function addSubscriptionJobData(job: SubscriptionJobData): void {
  logger.debug(`Adding Subscription job`);
  if (queue) {
    queue.add(jobName, job);
  } else {
    logger.debug(`Subscription queue not initialized`);
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
 * Sends a subscription.
 * @param job The subscription job details.
 */
export async function sendSubscription(job: Job<SubscriptionJobData>): Promise<void> {
  const { subscriptionId, resourceType, id, versionId } = job.data;

  const [subscriptionOutcome, subscription] = await repo.readResource<Subscription>('Subscription', subscriptionId);
  assertOk(subscriptionOutcome);

  const [resourceOutcome, resource] = await repo.readVersion(resourceType, id, versionId);
  assertOk(resourceOutcome);

  const channelType = subscription?.channel?.type;
  if (channelType === 'rest-hook') {
    if (subscription?.channel?.endpoint?.startsWith('Bot/')) {
      await execBot(job, subscription, resource as Resource);
    } else {
      await sendRestHook(job, subscription as Subscription, resource as Resource);
    }
  }
}

/**
 * Sends a rest-hook subscription.
 * @param job The subscription job details.
 * @param subscription The subscription.
 * @param resource The resource that triggered the subscription.
 */
export async function sendRestHook(job: Job<SubscriptionJobData>, subscription: Subscription, resource: Resource): Promise<void> {
  const url = subscription?.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    logger.debug(`Ignore rest hook missing URL`);
    return;
  }

  const headers = buildRestHookHeaders(subscription, resource);
  const body = stringify(resource);
  let error: Error | undefined = undefined;

  try {
    logger.info('Sending rest hook to: ' + url);
    const response = await fetch(url, { method: 'POST', headers, body });
    logger.info('Received rest hook status: ' + response.status);
    await createSubscriptionEvent(
      subscription,
      resource,
      response.status === 200 ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
      `Attempt ${job.attemptsMade} received status ${response.status}`);

    if (response.status >= 400) {
      error = new Error('Received status ' + response.status);
    }

  } catch (ex) {
    logger.info('Subscription exception: ' + ex);
    await createSubscriptionEvent(
      subscription,
      resource,
      AuditEventOutcome.MinorFailure,
      `Attempt ${job.attemptsMade} received error ${ex}`);
    error = ex as Error;
  }

  if (error) {
    throw error;
  }
}

/**
 * Builds a collection of HTTP request headers for the rest-hook subscription.
 * @param subscription The subscription resource.
 * @param resource The trigger resource.
 * @returns The HTTP request headers.
 */
function buildRestHookHeaders(subscription: Subscription, resource: Resource): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/fhir+json'
  };

  if (subscription.channel?.header) {
    for (const header of subscription.channel.header) {
      const [key, value] = header.split(/:/);
      headers[key.trim()] = value.trim();
    }
  }

  const secret = getExtensionValue(subscription, 'https://www.medplum.com/fhir/StructureDefinition-subscriptionSecret');
  if (secret) {
    const body = stringify(resource);
    headers['X-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
  }

  return headers;
}

/**
 * Executes a Bot sbuscription.
 * @param job The subscription job details.
 * @param subscription The subscription.
 * @param resource The resource that triggered the subscription.
 */
export async function execBot(job: Job<SubscriptionJobData>, subscription: Subscription, resource: Resource): Promise<void> {
  const url = subscription?.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    logger.debug(`Ignore rest hook missing URL`);
    return;
  }

  // URL should be a Bot reference string
  const [botOutcome, bot] = await repo.readReference<Bot>({ reference: url });
  assertOk(botOutcome);

  const code = bot?.code;
  if (!code) {
    logger.debug('Ignore action subscription missing code');
    return;
  }

  const botLog = [];

  const botConsole = {
    ...console,
    log: (...params: any[]) => botLog.push(params)
  };

  const botRepo = new Repository({
    project: bot?.meta?.project as string,
    author: createReference(bot as Bot)
  });

  const sandbox = {
    resource,
    console: botConsole,
    repo: botRepo
  };

  const options: vm.RunningScriptOptions = {
    timeout: 100
  };

  let outcome: AuditEventOutcome = AuditEventOutcome.Success;

  try {
    vm.runInNewContext(code, sandbox, options);
    botLog.push('Success');
  } catch (error) {
    outcome = AuditEventOutcome.MinorFailure;
    botLog.push('Error:', (error as Error).message);
  }

  await createSubscriptionEvent(subscription, resource, outcome, JSON.stringify(botLog, undefined, 2));
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

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param subscription The rest-hook subscription.
 * @param resource The resource that triggered the subscription.
 * @param outcome The outcome code.
 * @param outcomeDesc The outcome description text.
 */
async function createSubscriptionEvent(
  subscription: Subscription,
  resource: Resource,
  outcome: AuditEventOutcome,
  outcomeDesc?: string): Promise<void> {

  await repo.createResource<AuditEvent>({
    resourceType: 'AuditEvent',
    meta: {
      project: subscription.meta?.project
    },
    recorded: new Date().toISOString(),
    type: {
      code: 'transmit'
    },
    agent: [{
      type: {
        text: 'subscription'
      },
      requestor: false
    }],
    source: {
      // Observer cannot be a Subscription resource
      // observer: createReference(subscription)
    },
    entity: [
      {
        what: createReference(resource),
        role: {
          code: '4',
          display: 'Domain'
        }
      },
      {
        what: createReference(subscription),
        role: {
          code: '9',
          display: 'Subscriber'
        }
      }
    ],
    outcome,
    outcomeDesc
  });
}
