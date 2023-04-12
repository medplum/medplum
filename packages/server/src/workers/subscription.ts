import {
  createReference,
  getExtension,
  getExtensionValue,
  isGone,
  matchesSearchRequest,
  normalizeOperationOutcome,
  Operator,
  parseSearchUrl,
  stringify,
} from '@medplum/core';
import { Bot, ProjectMembership, Reference, Resource, Subscription } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { createHmac } from 'crypto';
import fetch, { HeadersInit } from 'node-fetch';
import { URL } from 'url';
import { MedplumRedisConfig } from '../config';
import { executeBot } from '../fhir/operations/execute';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { AuditEventOutcome } from '../util/auditevent';
import { BackgroundJobContext } from './context';
import { createAuditEvent, findProjectMembership, isJobSuccessful } from './utils';

const MAX_JOB_ATTEMPTS = 18;

/*
 * The subscription worker inspects every resource change,
 * and executes FHIR Subscription resources for those changes.
 *
 * The common case is to perform an outbound HTTP request to a webhook.
 * But Subscriptions can include email and SMS notifications.
 */

export interface SubscriptionJobData {
  readonly subscriptionId: string;
  readonly resourceType: string;
  readonly id: string;
  readonly versionId: string;
}

const queueName = 'SubscriptionQueue';
const jobName = 'SubscriptionJobData';
let queue: Queue<SubscriptionJobData> | undefined = undefined;
let worker: Worker<SubscriptionJobData> | undefined = undefined;

/**
 * Initializes the subscription worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 */
export function initSubscriptionWorker(config: MedplumRedisConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config,
  };

  queue = new Queue<SubscriptionJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: MAX_JOB_ATTEMPTS, // 1 second * 2^18 = 73 hours
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<SubscriptionJobData>(queueName, execSubscriptionJob, defaultOptions);
  worker.on('completed', (job) => logger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => logger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the subscription worker.
 * Closes the BullMQ job queue.
 * Clsoes the BullMQ worker.
 */
export async function closeSubscriptionWorker(): Promise<void> {
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
 * Returns the subscription queue instance.
 * This is used by the unit tests.
 * @returns The subscription queue (if available).
 */
export function getSubscriptionQueue(): Queue<SubscriptionJobData> | undefined {
  return queue;
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
 * @param context The background job context.
 */
export async function addSubscriptionJobs(resource: Resource, context: BackgroundJobContext): Promise<void> {
  if (resource.resourceType === 'AuditEvent') {
    // Never send subscriptions for audit events
    return;
  }
  const subscriptions = await getSubscriptions(resource);
  logger.debug(`Evaluate ${subscriptions.length} subscription(s)`);
  for (const subscription of subscriptions) {
    if (matchesCriteria(resource, subscription, context)) {
      await addSubscriptionJobData({
        subscriptionId: subscription.id as string,
        resourceType: resource.resourceType,
        id: resource.id as string,
        versionId: resource.meta?.versionId as string,
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
function matchesCriteria(resource: Resource, subscription: Subscription, context: BackgroundJobContext): boolean {
  if (subscription.meta?.account && resource.meta?.account?.reference !== subscription.meta.account.reference) {
    logger.debug('Ignore resource in different account compartment');
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
    logger.debug(
      `Ignore rest hook for different resourceType (wanted "${searchRequest.resourceType}", received "${resource.resourceType}")`
    );
    return false;
  }

  const supportedInteractionExtension = getExtension(
    subscription,
    'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction'
  );
  if (supportedInteractionExtension && supportedInteractionExtension.valueCode !== context.interaction) {
    logger.debug(
      `Ignore rest hook for different interaction (wanted "${supportedInteractionExtension.valueCode}", received "${context.interaction}")`
    );
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
 * Adds a subscription job to the queue.
 * @param job The subscription job details.
 */
async function addSubscriptionJobData(job: SubscriptionJobData): Promise<void> {
  logger.debug(`Adding Subscription job`);
  if (queue) {
    await queue.add(jobName, job);
  } else {
    logger.debug(`Subscription queue not initialized`);
  }
}

/**
 * Loads the list of all subscriptions in this repository.
 * @param resource The resource that was created or updated.
 * @returns The list of all subscriptions in this repository.
 */
async function getSubscriptions(resource: Resource): Promise<Subscription[]> {
  const project = resource.meta?.project;
  if (!project) {
    return [];
  }
  return systemRepo.searchResources<Subscription>({
    resourceType: 'Subscription',
    count: 1000,
    filters: [
      {
        code: '_project',
        operator: Operator.EQUALS,
        value: project,
      },
      {
        code: 'status',
        operator: Operator.EQUALS,
        value: 'active',
      },
    ],
  });
}

/**
 * Executes a subscription job.
 * @param job The subscription job details.
 */
export async function execSubscriptionJob(job: Job<SubscriptionJobData>): Promise<void> {
  const { subscriptionId, resourceType, id, versionId } = job.data;

  let subscription;
  try {
    subscription = await systemRepo.readResource<Subscription>('Subscription', subscriptionId);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isGone(outcome)) {
      // If the subscription was deleted, then stop processing it.
      return;
    }
    // Otherwise re-throw
    throw err;
  }

  if (subscription.status !== 'active') {
    // If the subscription has been disabled, then stop processing it.
    return;
  }

  let currentVersion;
  try {
    currentVersion = await systemRepo.readResource(resourceType, id);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isGone(outcome)) {
      // If the resource was deleted, then stop processing it.
      return;
    }
    // Otherwise re-throw
    throw err;
  }

  if (job.attemptsMade > 0 && currentVersion.meta?.versionId !== versionId) {
    // If this is a retry and the resource is not the current version, then stop processing it.
    return;
  }

  try {
    const resourceVersion = await systemRepo.readVersion(resourceType, id, versionId);

    const channelType = subscription?.channel?.type;
    if (channelType === 'rest-hook') {
      if (subscription?.channel?.endpoint?.startsWith('Bot/')) {
        await execBot(subscription, resourceVersion);
      } else {
        await sendRestHook(job, subscription, resourceVersion);
      }
    }
  } catch (err) {
    const maxJobAttempts =
      getExtension(subscription, 'http://medplum.com/fhir/StructureDefinition/subscription-max-attempts')
        ?.valueInteger ?? MAX_JOB_ATTEMPTS;

    if (job.attemptsMade < maxJobAttempts) {
      logger.debug(`Retrying job due to error: ${err}`);
      throw err;
    } else {
      // If the maxJobAttempts equals the jobs.attemptsMade, we won't throw, which won't trigger a retry
      logger.debug(`Max attempts made for job ${job.id}, subscription: ${subscription.id}`);
    }
  }
}

/**
 * Sends a rest-hook subscription.
 * @param job The subscription job details.
 * @param subscription The subscription.
 * @param resource The resource that triggered the subscription.
 */
async function sendRestHook(
  job: Job<SubscriptionJobData>,
  subscription: Subscription,
  resource: Resource
): Promise<void> {
  const url = subscription?.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    logger.debug(`Ignore rest hook missing URL`);
    return;
  }

  const startTime = new Date().toISOString();
  const headers = buildRestHookHeaders(subscription, resource);
  const body = stringify(resource);
  let error: Error | undefined = undefined;

  try {
    logger.info('Sending rest hook to: ' + url);
    logger.debug('Rest hook headers: ' + JSON.stringify(headers, undefined, 2));
    const response = await fetch(url, { method: 'POST', headers, body });
    logger.info('Received rest hook status: ' + response.status);
    const success = isJobSuccessful(subscription, response.status);
    await createAuditEvent(
      resource,
      startTime,
      success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
      `Attempt ${job.attemptsMade} received status ${response.status}`,
      subscription
    );

    if (!success) {
      error = new Error('Received status ' + response.status);
    }
  } catch (ex) {
    logger.info('Subscription exception: ' + ex);
    await createAuditEvent(
      resource,
      startTime,
      AuditEventOutcome.MinorFailure,
      `Attempt ${job.attemptsMade} received error ${ex}`,
      subscription
    );
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
    'Content-Type': 'application/fhir+json',
  };

  if (subscription.channel?.header) {
    for (const header of subscription.channel.header) {
      const [key, value] = header.split(/:/);
      headers[key.trim()] = value.trim();
    }
  }

  // Look for signature secret in Medplum extension
  // Note that the first version of the extension used a different URL
  // We still support the old URL for backwards compatibility
  const secret =
    getExtensionValue(subscription, 'https://www.medplum.com/fhir/StructureDefinition/subscription-secret') ||
    getExtensionValue(subscription, 'https://www.medplum.com/fhir/StructureDefinition-subscriptionSecret');
  if (secret) {
    const body = stringify(resource);
    headers['X-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
  }

  return headers;
}

/**
 * Executes a Bot sbuscription.
 * @param subscription The subscription.
 * @param resource The resource that triggered the subscription.
 */
async function execBot(subscription: Subscription, resource: Resource): Promise<void> {
  const startTime = new Date().toISOString();
  const url = subscription?.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    logger.debug(`Ignore rest hook missing URL`);
    return;
  }

  // URL should be a Bot reference string
  const bot = await systemRepo.readReference<Bot>({ reference: url });

  const project = bot.meta?.project as string;
  let runAs: ProjectMembership | undefined;
  if (bot.runAsUser) {
    runAs = await findProjectMembership(project, resource.meta?.author as Reference);
  } else {
    runAs = await findProjectMembership(project, createReference(bot));
  }

  if (!runAs) {
    throw new Error('Could not find project membership for bot');
  }

  let outcome: AuditEventOutcome;
  let logResult: string;

  try {
    const result = await executeBot({ bot, runAs, input: resource, contentType: 'application/fhir+json' });
    outcome = result.success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure;
    logResult = result.logResult;
  } catch (error) {
    outcome = AuditEventOutcome.MajorFailure;
    logResult = (error as Error).message;
  }

  await createAuditEvent(resource, startTime, outcome, logResult, subscription, bot);
}
