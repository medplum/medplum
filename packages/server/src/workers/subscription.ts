import {
  AccessPolicyInteraction,
  ContentType,
  createReference,
  getExtension,
  getExtensionValue,
  getReferenceString,
  isGone,
  matchesSearchRequest,
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  satisfiedAccessPolicy,
  serverError,
  stringify,
} from '@medplum/core';
import { Bot, Project, ProjectMembership, Reference, Resource, Subscription } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { createHmac } from 'crypto';
import fetch, { HeadersInit } from 'node-fetch';
import { MedplumServerConfig } from '../config';
import { getLogger, getRequestContext, tryGetRequestContext, tryRunInRequestContext } from '../context';
import { buildAccessPolicy } from '../fhir/accesspolicy';
import { executeBot } from '../fhir/operations/execute';
import { getSystemRepo, Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';
import { createSubEventNotification } from '../subscriptions/websockets';
import { parseTraceparent } from '../traceparent';
import { AuditEventOutcome } from '../util/auditevent';
import { BackgroundJobContext, BackgroundJobInteraction } from './context';
import { createAuditEvent, findProjectMembership, isFhirCriteriaMet, isJobSuccessful } from './utils';

/**
 * The upper limit on the number of times a job can be retried.
 * Using exponential backoff, 18 retries is about 73 hours.
 */
const MAX_JOB_ATTEMPTS = 18;

/**
 * The default number of times a job will be retried.
 * This can be overridden by the subscription-max-attempts extension.
 */
const DEFAULT_RETRIES = 3;

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
  readonly interaction: 'create' | 'update' | 'delete';
  readonly requestTime: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'SubscriptionQueue';
const jobName = 'SubscriptionJobData';
let queue: Queue<SubscriptionJobData> | undefined = undefined;
let worker: Worker<SubscriptionJobData> | undefined = undefined;

/**
 * Initializes the subscription worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 * @param config - The Medplum server config to use.
 */
export function initSubscriptionWorker(config: MedplumServerConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
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

  worker = new Worker<SubscriptionJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execSubscriptionJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
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
 * Checks if this resource should create a notification for this `Subscription` based on the access policy that should be applied for this `Subscription`.
 * The `AccessPolicy` of author's `ProjectMembership` for this resource's `Project` is used when evaluating whether the `AccessPolicy` is satisfied.
 *
 * Currently we log if the `AccessPolicy` is not satisfied only.
 *
 * TODO: Actually prevent notifications for `Subscriptions` where the `AccessPolicy` is not satisfied (for rest-hook subscriptions)
 *
 * @param resource - The resource to evaluate against the `AccessPolicy`.
 * @param project - The project containing the resource.
 * @param subscription - The `Subscription` to get the `AccessPolicy` for.
 * @returns True if access policy is satisfied for this Subscription notification, otherwise returns false
 */
async function satisfiesAccessPolicy(
  resource: Resource,
  project: Project,
  subscription: Subscription
): Promise<boolean> {
  let satisfied = true;
  try {
    // Check access policy
    const subAuthor = subscription.meta?.author;
    if (subAuthor) {
      const membership = await findProjectMembership(project.id as string, subAuthor);
      if (membership) {
        const accessPolicy = await buildAccessPolicy(membership);
        satisfied = !!satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);
        if (!satisfied) {
          const resourceReference = getReferenceString(resource);
          const subReference = getReferenceString(subscription);
          const projectReference = getReferenceString(project);
          globalLogger.warn(
            `[Subscription Access Policy]: Access Policy not satisfied on '${resourceReference}' for '${subReference}'`,
            { subscription: subReference, project: projectReference, accessPolicy }
          );
        }
      } else {
        const projectReference = getReferenceString(project);
        const authorReference = getReferenceString(subAuthor);
        const subReference = getReferenceString(subscription);
        globalLogger.warn(
          `[Subscription Access Policy]: No membership for subscription author '${authorReference}' in project '${projectReference}'`,
          { subscription: subReference }
        );
        satisfied = false;
      }
    } else {
      // Log it if there is no author for this Subscription (this is not good)
      globalLogger.warn(
        `[Subscription Access Policy]: No author for subscription '${getReferenceString(subscription)}'`
      );
      satisfied = false;
    }
  } catch (err: unknown) {
    const resourceReference = getReferenceString(resource);
    const subReference = getReferenceString(subscription);
    globalLogger.warn(
      `[Subscription Access Policy]: Error occurred while checking access policy for resource '${resourceReference}' against '${subReference}'`,
      { error: err, subscription: subReference }
    );
    satisfied = false;
  }
  // Always return true if channelType !== websocket for now
  return subscription.channel.type === 'websocket' ? satisfied : true;
}

/**
 * Adds all subscription jobs for a given resource.
 *
 * There are a few important structural considerations:
 * 1) One resource change can spawn multiple subscription jobs.
 * 2) Subscription jobs can fail, and must be retried independently.
 * 3) Subscriptions should be evaluated at the time of the resource change.
 *
 * So, when a resource changes (create, update, or delete), we evaluate all subscriptions
 * at that moment in time.  For each matching subscription, we enqueue the job.
 * The only purpose of the job is to make the outbound HTTP request,
 * not to re-evaluate the subscription.
 * @param resource - The resource that was created or updated.
 * @param context - The background job context.
 */
export async function addSubscriptionJobs(resource: Resource, context: BackgroundJobContext): Promise<void> {
  if (resource.resourceType === 'AuditEvent') {
    // Never send subscriptions for audit events
    return;
  }

  const ctx = tryGetRequestContext();
  const logger = getLogger();
  const systemRepo = getSystemRepo();
  let project: Project | undefined;
  try {
    const projectId = resource.meta?.project;
    if (projectId) {
      project = await systemRepo.readResource<Project>('Project', projectId);
    }
  } catch (err: unknown) {
    const resourceReference = getReferenceString(resource);
    globalLogger.error(`[Subscription]: No project found for '${resourceReference}' -- something is very wrong.`, {
      error: err,
      resource: resourceReference,
    });
    return;
  }
  if (!project) {
    return;
  }

  const requestTime = new Date().toISOString();
  const subscriptions = await getSubscriptions(resource, project);
  logger.debug(`Evaluate ${subscriptions.length} subscription(s)`);

  for (const subscription of subscriptions) {
    const criteria = await matchesCriteria(resource, subscription, context);
    if (criteria) {
      if (!(await satisfiesAccessPolicy(resource, project, subscription))) {
        continue;
      }
      await addSubscriptionJobData({
        subscriptionId: subscription.id as string,
        resourceType: resource.resourceType,
        id: resource.id as string,
        versionId: resource.meta?.versionId as string,
        interaction: context.interaction,
        requestTime,
        requestId: ctx?.requestId,
        traceId: ctx?.traceId,
      });
    }
  }
}

/**
 * Determines if the resource matches the subscription criteria.
 * @param resource - The resource that was created or updated.
 * @param subscription - The subscription.
 * @param context - Background job context.
 * @returns True if the resource matches the subscription criteria.
 */
async function matchesCriteria(
  resource: Resource,
  subscription: Subscription,
  context: BackgroundJobContext
): Promise<boolean> {
  const ctx = getRequestContext();
  if (subscription.meta?.account && resource.meta?.account?.reference !== subscription.meta.account.reference) {
    ctx.logger.debug('Ignore resource in different account compartment');
    return false;
  }

  if (!matchesChannelType(subscription)) {
    ctx.logger.debug(`Ignore subscription without recognized channel type`);
    return false;
  }

  const subscriptionCriteria = subscription.criteria;
  if (!subscriptionCriteria) {
    ctx.logger.debug(`Ignore rest hook missing criteria`);
    return false;
  }

  const searchRequest = parseSearchRequest(subscriptionCriteria);
  if (resource.resourceType !== searchRequest.resourceType) {
    ctx.logger.debug(
      `Ignore rest hook for different resourceType (wanted "${searchRequest.resourceType}", received "${resource.resourceType}")`
    );
    return false;
  }

  const fhirPathCriteria = await isFhirCriteriaMet(subscription, resource);
  if (!fhirPathCriteria) {
    ctx.logger.debug(`Ignore rest hook for criteria returning false`);
    return false;
  }

  const supportedInteractionExtension = getExtension(
    subscription,
    'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction'
  );
  if (supportedInteractionExtension && supportedInteractionExtension.valueCode !== context.interaction) {
    ctx.logger.debug(
      `Ignore rest hook for different interaction (wanted "${supportedInteractionExtension.valueCode}", received "${context.interaction}")`
    );
    return false;
  }

  return matchesSearchRequest(resource, searchRequest);
}

/**
 * Returns true if the subscription channel type is ok to execute.
 * @param subscription - The subscription resource.
 * @returns True if the subscription channel type is ok to execute.
 */
function matchesChannelType(subscription: Subscription): boolean {
  const channelType = subscription.channel?.type;

  if (channelType === 'rest-hook') {
    const url = subscription.channel?.endpoint;
    if (!url) {
      getLogger().debug(`Ignore rest-hook missing URL`);
      return false;
    }

    return true;
  }

  if (channelType === 'websocket') {
    return true;
  }

  return false;
}

/**
 * Adds a subscription job to the queue.
 * @param job - The subscription job details.
 */
async function addSubscriptionJobData(job: SubscriptionJobData): Promise<void> {
  if (queue) {
    await queue.add(jobName, job);
  }
}

/**
 * Loads the list of all subscriptions in this repository.
 * @param resource - The resource that was created or updated.
 * @param project - The project that contains this resource.
 * @returns The list of all subscriptions in this repository.
 */
async function getSubscriptions(resource: Resource, project: Project): Promise<Subscription[]> {
  const projectId = project.id as string;
  const systemRepo = getSystemRepo();
  const subscriptions = await systemRepo.searchResources<Subscription>({
    resourceType: 'Subscription',
    count: 1000,
    filters: [
      {
        code: '_project',
        operator: Operator.EQUALS,
        value: projectId,
      },
      {
        code: 'status',
        operator: Operator.EQUALS,
        value: 'active',
      },
    ],
  });
  const redisOnlySubRefStrs = await getRedis().smembers(`medplum:subscriptions:r4:project:${projectId}:active`);
  if (redisOnlySubRefStrs.length) {
    const redisOnlySubStrs = await getRedis().mget(redisOnlySubRefStrs);
    if (project.features?.includes('websocket-subscriptions')) {
      const subArrStr = '[' + redisOnlySubStrs.filter(Boolean).join(',') + ']';
      const inMemorySubs = JSON.parse(subArrStr) as { resource: Subscription; projectId: string }[];
      for (const { resource } of inMemorySubs) {
        subscriptions.push(resource);
      }
    } else {
      globalLogger.warn(
        `[WebSocket Subscriptions]: subscription for resource '${getReferenceString(resource)}' might have been fired but WebSocket subscriptions are not enabled for project '${project.name ?? getReferenceString(project)}'`
      );
    }
  }
  return subscriptions;
}

/**
 * Executes a subscription job.
 * @param job - The subscription job details.
 */
export async function execSubscriptionJob(job: Job<SubscriptionJobData>): Promise<void> {
  const systemRepo = getSystemRepo();
  const { subscriptionId, resourceType, id, versionId, interaction, requestTime } = job.data;

  const subscription = await tryGetSubscription(systemRepo, subscriptionId);
  if (!subscription) {
    // If the subscription was deleted, then stop processing it.
    return;
  }

  if (subscription.status !== 'active') {
    // If the subscription has been disabled, then stop processing it.
    return;
  }

  if (interaction !== 'delete') {
    const currentVersion = await tryGetCurrentVersion(systemRepo, resourceType, id);
    if (!currentVersion) {
      // If the resource was deleted, then stop processing it.
      return;
    }

    if (job.attemptsMade > 0 && currentVersion.meta?.versionId !== versionId) {
      // If this is a retry and the resource is not the current version, then stop processing it.
      return;
    }
  }

  try {
    const versionedResource = await systemRepo.readVersion(resourceType, id, versionId);
    const channelType = subscription.channel?.type;
    switch (channelType) {
      case 'rest-hook':
        if (subscription.channel?.endpoint?.startsWith('Bot/')) {
          await execBot(subscription, versionedResource, interaction, requestTime);
        } else {
          await sendRestHook(job, subscription, versionedResource, interaction, requestTime);
        }
        break;
      case 'websocket':
        await getRedis().publish(
          subscriptionId as string,
          JSON.stringify(createSubEventNotification(versionedResource, subscriptionId, { includeResource: true }))
        );
        break;
      default:
        throw new OperationOutcomeError(serverError(new Error('Subscription type not currently supported.')));
    }
  } catch (err) {
    await catchJobError(subscription, job, err);
  }
}

async function tryGetSubscription(systemRepo: Repository, subscriptionId: string): Promise<Subscription | undefined> {
  try {
    return await systemRepo.readResource<Subscription>('Subscription', subscriptionId);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isGone(outcome)) {
      // If the subscription was deleted, then stop processing it.
      return undefined;
    }
    // Otherwise re-throw
    throw err;
  }
}

async function tryGetCurrentVersion(
  systemRepo: Repository,
  resourceType: string,
  id: string
): Promise<Resource | undefined> {
  try {
    return await systemRepo.readResource(resourceType, id);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isGone(outcome)) {
      // If the resource was deleted, then stop processing it.
      return undefined;
    }
    // Otherwise re-throw
    throw err;
  }
}

/**
 * Sends a rest-hook subscription.
 * @param job - The subscription job details.
 * @param subscription - The subscription.
 * @param resource - The resource that triggered the subscription.
 * @param interaction - The interaction type.
 * @param requestTime - The request time.
 */
async function sendRestHook(
  job: Job<SubscriptionJobData>,
  subscription: Subscription,
  resource: Resource,
  interaction: BackgroundJobInteraction,
  requestTime: string
): Promise<void> {
  const ctx = getRequestContext();
  const url = subscription.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    ctx.logger.debug(`Ignore rest hook missing URL`);
    return;
  }

  const headers = buildRestHookHeaders(subscription, resource) as Record<string, string>;
  if (interaction === 'delete') {
    headers['X-Medplum-Deleted-Resource'] = `${resource.resourceType}/${resource.id}`;
  }
  const traceId = job.data.traceId;
  if (traceId) {
    headers['x-trace-id'] = traceId;
    if (parseTraceparent(traceId)) {
      headers['traceparent'] = traceId;
    }
  }

  const body = interaction === 'delete' ? '{}' : stringify(resource);
  let error: Error | undefined = undefined;

  try {
    ctx.logger.info('Sending rest hook to: ' + url);
    ctx.logger.debug('Rest hook headers: ' + JSON.stringify(headers, undefined, 2));
    const response = await fetch(url, { method: 'POST', headers, body });
    ctx.logger.info('Received rest hook status: ' + response.status);
    const success = isJobSuccessful(subscription, response.status);
    await createAuditEvent(
      resource,
      requestTime,
      success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure,
      `Attempt ${job.attemptsMade} received status ${response.status}`,
      subscription
    );

    if (!success) {
      error = new Error('Received status ' + response.status);
    }
  } catch (ex) {
    ctx.logger.info('Subscription exception: ' + ex);
    await createAuditEvent(
      resource,
      requestTime,
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
 * @param subscription - The subscription resource.
 * @param resource - The trigger resource.
 * @returns The HTTP request headers.
 */
function buildRestHookHeaders(subscription: Subscription, resource: Resource): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': ContentType.FHIR_JSON,
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
 * Executes a Bot subscription.
 * @param subscription - The subscription.
 * @param resource - The resource that triggered the subscription.
 * @param interaction - The interaction type.
 * @param requestTime - The request time.
 */
async function execBot(
  subscription: Subscription,
  resource: Resource,
  interaction: BackgroundJobInteraction,
  requestTime: string
): Promise<void> {
  const ctx = getRequestContext();
  const url = subscription.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    ctx.logger.debug(`Ignore rest hook missing URL`);
    return;
  }

  // URL should be a Bot reference string
  const systemRepo = getSystemRepo();
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

  await executeBot({
    subscription,
    bot,
    runAs,
    input: interaction === 'delete' ? { deletedResource: resource } : resource,
    contentType: ContentType.FHIR_JSON,
    requestTime,
    traceId: ctx.traceId,
  });
}

async function catchJobError(subscription: Subscription, job: Job<SubscriptionJobData>, err: any): Promise<void> {
  const maxJobAttempts =
    getExtension(subscription, 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts')
      ?.valueInteger ?? DEFAULT_RETRIES;

  if (job.attemptsMade < maxJobAttempts) {
    globalLogger.debug(`Retrying job due to error: ${err}`);

    // Lower the job priority
    // "Note that the priorities go from 1 to 2 097 152, where a lower number is always a higher priority than higher numbers."
    // "Jobs without a `priority`` assigned will get the most priority."
    // See: https://docs.bullmq.io/guide/jobs/prioritized
    await job.changePriority({ priority: 1 + job.attemptsMade });

    throw err;
  }
  // If the maxJobAttempts equals the jobs.attemptsMade, we won't throw, which won't trigger a retry
  globalLogger.debug(`Max attempts made for job ${job.id}, subscription: ${subscription.id}`);
}
