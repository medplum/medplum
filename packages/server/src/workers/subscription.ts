// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobContext, BackgroundJobInteraction, WithId } from '@medplum/core';
import {
  AccessPolicyInteraction,
  ContentType,
  EMPTY,
  Operator,
  createReference,
  deepClone,
  getExtension,
  getExtensionValue,
  getReferenceString,
  isGone,
  isNotFound,
  isString,
  matchesSearchRequest,
  normalizeOperationOutcome,
  parseSearchRequest,
  resourceMatchesSubscriptionCriteria,
  satisfiedAccessPolicy,
  stringify,
} from '@medplum/core';
import type {
  Bot,
  ClientApplication,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  Reference,
  RelatedPerson,
  Resource,
  ResourceType,
  Subscription,
} from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import fetch from 'node-fetch';
import { createHmac } from 'node:crypto';
import { executeBot } from '../bots/execute';
import { getRequestContext, runInAsyncContext, tryGetRequestContext, tryRunInRequestContext } from '../context';
import { buildAccessPolicy } from '../fhir/accesspolicy';
import { isPreCommitSubscription } from '../fhir/precommit';
import type { ResendSubscriptionsOptions, SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo, getProjectSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { RewriteMode, rewriteAttachments } from '../fhir/rewrite';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { getLogger, globalLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import { recordHistogramValue } from '../otel/otel';
import { getRedis, reconnectOnError } from '../redis';
import type { SubEventsOptions } from '../subscriptions/websockets';
import { getActiveSubsKey } from '../subscriptions/websockets';
import { parseTraceparent } from '../traceparent';
import { AuditEventOutcome, createSubscriptionAuditEvent } from '../util/auditevent';
import type { WorkerInitializer } from './utils';
import { addVerboseQueueLogging, findProjectMembership, isJobSuccessful, queueRegistry } from './utils';

/**
 * The timeout for outbound rest-hook subscription HTTP requests.
 * This is passed into fetch and will make fetch abort the request after REQUEST_TIMEOUT milliseconds.
 */
const REQUEST_TIMEOUT = 120_000; // 120 seconds, 2 mins

/**
 * The upper limit on the number of times a job can be attempted.
 * Using exponential backoff, 19 attempts is about 73 hours (2^18 seconds).
 */
const MAX_JOB_ATTEMPTS = 19;

/**
 * The default number of times a job will be attempted.
 * This can be overridden by the subscription-max-attempts extension.
 */
const DEFAULT_ATTEMPTS = 4;

/**
 * The maximum number of attempts to get through the preamble (loading subscription and resource).
 * Errors in the preamble point to issues with the Medplum server as opposed to the client's hook, bot, etc,
 * so we limit the number of retries differently. Set to a large value to allow time for server issues to be resolved
 * before dropping the job.
 */
const MAX_PREAMBLE_ATTEMPTS = MAX_JOB_ATTEMPTS;

/*
 * The subscription worker inspects every resource change,
 * and executes FHIR Subscription resources for those changes.
 *
 * The common case is to perform an outbound HTTP request to a webhook.
 * But Subscriptions can include email and SMS notifications.
 */

export interface SubscriptionJobData {
  readonly subscriptionId: string;
  readonly resourceType: ResourceType;
  readonly channelType?: Subscription['channel']['type'];
  readonly id: string;
  readonly versionId: string;
  readonly interaction: 'create' | 'update' | 'delete';
  readonly requestTime: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly authState?: AuthState;
  readonly verbose?: boolean;
}

function getLoggingFields(job: Job<SubscriptionJobData>): Record<string, string | undefined> {
  return {
    subscription: 'Subscription/' + job.data.subscriptionId,
    resource: `${job.data.resourceType}/${job.data.id}`,
    versionId: job.data.versionId,
    interaction: job.data.interaction,
    channelType: job.data.channelType,
    requestId: job.data.requestId,
    traceId: job.data.traceId,
  };
}

const queueName = 'SubscriptionQueue';
const jobName = 'SubscriptionJobData';

export const initSubscriptionWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: { ...config.redis, reconnectOnError },
  };

  const queue = new Queue<SubscriptionJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: MAX_JOB_ATTEMPTS, // 1 second * 2^18 = 73 hours
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  const worker = new Worker<SubscriptionJobData>(
    queueName,
    (job) =>
      job.data.authState
        ? runInAsyncContext(job.data.authState, job.data.requestId, job.data.traceId, () => execSubscriptionJob(job))
        : tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execSubscriptionJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  addVerboseQueueLogging<SubscriptionJobData>(queue, worker, getLoggingFields);
  worker.on('active', (job) => {
    // Only record queuedDuration on the first attempt
    if (job.attemptsMade === 0) {
      recordHistogramValue('medplum.subscription.queuedDuration', (Date.now() - job.timestamp) / 1000);
    }
  });
  worker.on('completed', (job) => {
    recordHistogramValue(
      'medplum.subscription.executionDuration',
      ((job.finishedOn as number) - (job.processedOn as number)) / 1000
    );
    recordHistogramValue('medplum.subscription.totalDuration', ((job.finishedOn as number) - job.timestamp) / 1000);
  });
  worker.on('failed', (job) => {
    if (job) {
      recordHistogramValue(
        'medplum.subscription.failedExecutionDuration',
        ((job.finishedOn as number) - (job.processedOn as number)) / 1000
      );
    }
  });

  return { queue, worker, name: queueName };
};

/**
 * Returns the subscription queue instance.
 * This is used by the unit tests.
 * @returns The subscription queue (if available).
 */
export function getSubscriptionQueue(): Queue<SubscriptionJobData> | undefined {
  return queueRegistry.get(queueName);
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
  project: WithId<Project>,
  subscription: Subscription
): Promise<boolean> {
  let satisfied = true;
  try {
    // We can assert author because any time a resource is updated, the author will be set to the previous author or if it doesn't exist
    // The current Repository author, which must exist for Repository to successfully construct
    const subAuthor = subscription.meta?.author as Reference;
    const membership = await findProjectMembership(project.id, subAuthor);
    if (membership) {
      const accessPolicy = await buildAccessPolicy(membership);
      satisfied = !!satisfiedAccessPolicy(resource, AccessPolicyInteraction.READ, accessPolicy);
      if (!satisfied && subscription.channel.type !== 'websocket') {
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
        { subscription: subReference, project: projectReference }
      );
      satisfied = false;
    }
  } catch (err: unknown) {
    const projectReference = getReferenceString(project);
    const resourceReference = getReferenceString(resource);
    const subReference = getReferenceString(subscription);
    globalLogger.warn(
      `[Subscription Access Policy]: Error occurred while checking access policy for resource '${resourceReference}' against '${subReference}'`,
      { subscription: subReference, project: projectReference, error: err }
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
 * @param previousVersion - The previous version of the resource.
 * @param context - The background job context.
 * @param options - The resend subscriptions options.
 */
export async function addSubscriptionJobs(
  resource: WithId<Resource>,
  previousVersion: Resource | undefined,
  context: BackgroundJobContext,
  options?: ResendSubscriptionsOptions
): Promise<void> {
  if (resource.resourceType === 'AuditEvent') {
    // Never send subscriptions for audit events
    return;
  }

  // websocket subscriptions are persisted differently than other subscriptions
  // and are generally thought of as more transient in a way that firing subscriptions
  // for websocket subscriptions themselves would be quite noisy and not particularly useful
  // since they cannot be found through traditional means like reading by resource ID.
  if (resource.resourceType === 'Subscription' && resource.channel?.type === 'websocket') {
    return;
  }

  const ctx = tryGetRequestContext();
  const logger = getLogger();
  const logFn = options?.verbose ? logger.info : logger.debug;

  const project = context?.project;
  if (!project) {
    return;
  }

  const requestTime = new Date().toISOString();
  const subscriptions = await getSubscriptions(resource, project);
  logFn(`Evaluate ${subscriptions.length} subscription(s)`);

  const wsSubEvents = [] as [string, SubEventsOptions][];
  for (const subscription of subscriptions) {
    if (isPreCommitSubscription(subscription)) {
      // Ignore pre-commit subscriptions
      continue;
    }

    if (options?.subscription && options.subscription !== getReferenceString(subscription)) {
      logFn('Subscription does not match options.subscription');
      continue;
    }
    let matches: boolean;
    try {
      matches = await matchesCriteria(resource, previousVersion, subscription, context);
      logFn(`Subscription matchesCriteria(${resource.id}, ${subscription.id}) = ${matches}`);
    } catch (err) {
      // If we throw when evaluating the criteria, log and continue
      logFn('Error when evaluating matchesCriteria for resource against Subscription', {
        resourceType: resource.resourceType,
        resource: resource.id,
        subscription: subscription.id,
        err,
      });
      continue;
    }
    if (matches) {
      if (!(await satisfiesAccessPolicy(resource, project, subscription))) {
        logFn(`Subscription satisfiesAccessPolicy(${resource.id}) = false`);
        continue;
      }
      if (subscription.channel.type === 'websocket') {
        wsSubEvents.push([subscription.id, { includeResource: true }]);
        continue;
      }
      await addSubscriptionJobData({
        subscriptionId: subscription.id,
        resourceType: resource.resourceType,
        channelType: subscription.channel.type,
        id: resource.id,
        versionId: resource.meta?.versionId as string,
        interaction: context.interaction,
        requestTime,
        requestId: ctx?.requestId,
        traceId: ctx?.traceId,
        authState: ctx?.authState,
        verbose: options?.verbose,
      });
    }
  }

  if (wsSubEvents.length) {
    await getRedis().publish('medplum:subscriptions:r4:websockets', JSON.stringify({ resource, events: wsSubEvents }));
  }
}

/**
 * Determines if the resource matches the subscription criteria.
 * @param resource - The resource that was created or updated.
 * @param previousVersion - The previous version of the resource.
 * @param subscription - The subscription.
 * @param context - Background job context.
 * @returns True if the resource matches the subscription criteria.
 */
async function matchesCriteria(
  resource: Resource,
  previousVersion: Resource | undefined,
  subscription: Subscription,
  context: BackgroundJobContext
): Promise<boolean> {
  const ctx = getRequestContext();
  const getPreviousResource = async (): Promise<Resource | undefined> => previousVersion;
  return resourceMatchesSubscriptionCriteria({
    resource,
    subscription,
    context,
    logger: ctx.logger,
    getPreviousResource: getPreviousResource,
  });
}

/**
 * Adds a subscription job to the queue.
 * @param job - The subscription job details.
 */
async function addSubscriptionJobData(job: SubscriptionJobData): Promise<void> {
  const queue = queueRegistry.get(queueName);
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
async function getSubscriptions(resource: Resource, project: WithId<Project>): Promise<WithId<Subscription>[]> {
  const projectId = project.id;
  const systemRepo = getProjectSystemRepo(projectId);
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
  const redis = getRedis();
  const hashKey = getActiveSubsKey(projectId, resource.resourceType);
  const entries = await redis.hgetall(hashKey);
  const redisOnlySubRefStrs: string[] = [];
  for (const [ref, criteria] of Object.entries(entries)) {
    try {
      if (matchesSearchRequest(resource, parseSearchRequest(criteria))) {
        redisOnlySubRefStrs.push(ref);
      }
    } catch (err) {
      getLogger().warn('[WS] Error while evaluating criteria for subscription', { err, subscription: ref, criteria });
    }
  }
  if (redisOnlySubRefStrs.length) {
    const redisOnlySubStrs = await redis.mget(redisOnlySubRefStrs);
    if (project.features?.includes('websocket-subscriptions')) {
      const activeSubStrs = redisOnlySubStrs.filter(Boolean);
      if (redisOnlySubStrs.length - activeSubStrs.length >= 50) {
        getLogger().warn('Excessive subscription cache miss', {
          numKeys: redisOnlySubRefStrs.length,
          hitRate: activeSubStrs.length / redisOnlySubStrs.length,
          projectId,
        });
        const inactiveSubs: string[] = [];
        for (let i = 0; i < redisOnlySubStrs.length; i++) {
          if (!redisOnlySubStrs[i]) {
            inactiveSubs.push(redisOnlySubRefStrs[i]);
          }
        }
        await redis.hdel(hashKey, ...inactiveSubs);
      }
      const subArrStr = '[' + activeSubStrs.join(',') + ']';
      const inMemorySubs = JSON.parse(subArrStr) as { resource: WithId<Subscription>; projectId: string }[];
      for (const { resource } of inMemorySubs) {
        subscriptions.push(resource);
      }
    } else {
      globalLogger.debug(
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
  let systemRepo: SystemRepository;
  let subscription: WithId<Subscription> | undefined;
  let rewrittenResource: Resource;

  try {
    const { subscriptionId, resourceType, id, versionId, verbose } = job.data;
    systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // job.data will eventually include shardId
    const logger = getLogger();
    const logFn = verbose ? logger.info : logger.debug;

    subscription = await tryGetSubscription(systemRepo, subscriptionId, job.data.channelType);
    if (!subscription) {
      // If the subscription was deleted, then stop processing it.
      logFn(`Subscription ${subscriptionId} not found`);
      return;
    }

    const channelType = subscription.channel.type;
    if (channelType !== 'rest-hook') {
      logFn(`Subscription ${subscriptionId} has unsupported channel type ${channelType}`);
      return;
    }

    if (subscription.status !== 'active') {
      // If the subscription has been disabled, then stop processing it.
      logFn(`Subscription ${subscriptionId} is not active`);
      return;
    }

    if (job.data.interaction !== 'delete') {
      const currentVersion = await tryGetCurrentVersion(systemRepo, resourceType, id);
      if (!currentVersion) {
        // If the resource was deleted, then stop processing it.
        logFn(`Resource ${resourceType}/${id} not found`);
        return;
      }

      if (job.attemptsMade > 0 && currentVersion.meta?.versionId !== versionId) {
        // If this is a retry and the resource is not the current version, then stop processing it.
        logFn(`Resource ${resourceType}/${id} is not the current version`);
        return;
      }
    }

    const versionedResource = await systemRepo.readVersion(resourceType, id, versionId);
    // We use the resource with rewritten attachments here since we want subscribers to get the resource with the same attachment URLs
    // They would get if they did a search
    rewrittenResource = await rewriteAttachments(RewriteMode.PRESIGNED_URL, systemRepo, deepClone(versionedResource));
  } catch (err) {
    if (job.attemptsMade < MAX_PREAMBLE_ATTEMPTS) {
      throw err;
    }

    // Too many errors in the preamble, give up
    globalLogger.error('Subscription job preamble failed too many times, giving up', getLoggingFields(job));
    return;
  }

  try {
    // Errors in this try/catch are considered to be issues in the client's rest hook or bot
    // and should trigger retries according to the subscription's max attempts
    if (subscription.channel?.endpoint?.startsWith('Bot/')) {
      await execBot(systemRepo, job, subscription, rewrittenResource, job.data.interaction, job.data.requestTime);
    } else {
      await sendRestHook(job, subscription, rewrittenResource, job.data.interaction, job.data.requestTime);
    }
  } catch (err) {
    await catchJobError(subscription, job, err);
  }
}

async function tryGetSubscription(
  systemRepo: SystemRepository,
  subscriptionId: string,
  channelType: SubscriptionJobData['channelType']
): Promise<WithId<Subscription> | undefined> {
  try {
    return await systemRepo.readResource<Subscription>('Subscription', subscriptionId, {
      checkCacheOnly: channelType === 'websocket',
    });
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    // If the Subscription was marked as deleted in the database, this will return "gone"
    // However, deleted WebSocket subscriptions will return "not found"
    if (isGone(outcome) || isNotFound(outcome)) {
      // If the subscription was deleted, then stop processing it.
      return undefined;
    }
    // Otherwise re-throw
    throw err;
  }
}

async function tryGetCurrentVersion<T extends Resource = Resource>(
  systemRepo: SystemRepository,
  resourceType: T['resourceType'],
  id: string
): Promise<T | undefined> {
  try {
    return await systemRepo.readResource(resourceType, id);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isGone(outcome) || isNotFound(outcome)) {
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
  subscription: WithId<Subscription>,
  resource: Resource,
  interaction: BackgroundJobInteraction,
  requestTime: string
): Promise<void> {
  const log = getLogger();
  const url = subscription.channel?.endpoint as string;
  if (!url) {
    // This can happen if a user updates the Subscription after the job is created.
    log.debug(`Ignore rest hook missing URL`);
    return;
  }

  const body = interaction === 'delete' ? '{}' : stringify(resource);
  const headers = buildRestHookHeaders(job, subscription, resource, interaction, body);
  let error: Error | undefined = undefined;

  const fetchStartTime = Date.now();
  let fetchEndTime: number;
  let systemRepo: SystemRepository;
  if (subscription.meta?.project) {
    systemRepo = getProjectSystemRepo(subscription.meta.project);
  } else {
    systemRepo = getGlobalSystemRepo(); // SHARDING is global correct if no project?
  }
  try {
    log.info('Sending rest hook to: ' + url);
    log.debug('Rest hook headers: ' + JSON.stringify(headers, undefined, 2));
    const response = await fetch(url, { method: 'POST', headers, body, timeout: REQUEST_TIMEOUT });
    fetchEndTime = Date.now();
    log.info('Received rest hook status: ' + response.status);
    const success = isJobSuccessful(subscription, response.status);
    await createSubscriptionAuditEvent(
      systemRepo,
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
    fetchEndTime = Date.now();
    log.info('Subscription exception: ' + ex);
    await createSubscriptionAuditEvent(
      systemRepo,
      resource,
      requestTime,
      AuditEventOutcome.MinorFailure,
      `Attempt ${job.attemptsMade} received error ${ex}`,
      subscription
    );
    error = ex as Error;
  }

  const fetchDurationMs = fetchEndTime - fetchStartTime;
  recordHistogramValue('medplum.subscription.restHookFetchDuration', fetchDurationMs / 1000);
  log.info('Subscription rest hook fetch duration', {
    fetchDurationMs,
    subscription: subscription.id,
    project: subscription?.meta?.project,
  });

  if (error) {
    throw error;
  }
}

/**
 * Builds a collection of HTTP request headers for the rest-hook subscription.
 * @param job - The subscription job.
 * @param subscription - The subscription resource.
 * @param resource - The trigger resource.
 * @param interaction - The interaction type.
 * @param body - The request body.
 * @returns The HTTP request headers.
 */
function buildRestHookHeaders(
  job: Job<SubscriptionJobData>,
  subscription: WithId<Subscription>,
  resource: Resource,
  interaction: BackgroundJobInteraction,
  body: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': ContentType.FHIR_JSON,
    'X-Medplum-Subscription': subscription.id,
    'X-Medplum-Interaction': interaction,
  };

  if (interaction === 'delete') {
    headers['X-Medplum-Deleted-Resource'] = `${resource.resourceType}/${resource.id}`;
  }

  for (const header of subscription.channel.header ?? EMPTY) {
    const [key, value] = header.split(/:/);
    headers[key.trim()] = value.trim();
  }

  // Look for signature secret in Medplum extension
  // Note that the first version of the extension used a different URL
  // We still support the old URL for backwards compatibility
  const secret =
    getExtensionValue(subscription, 'https://www.medplum.com/fhir/StructureDefinition/subscription-secret') ||
    getExtensionValue(subscription, 'https://www.medplum.com/fhir/StructureDefinition-subscriptionSecret');
  if (secret && isString(secret)) {
    headers['X-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
  }

  const traceId = job.data.traceId;
  if (traceId) {
    headers['x-trace-id'] = traceId;
    if (parseTraceparent(traceId)) {
      headers['traceparent'] = traceId;
    }
  }

  return headers;
}

/**
 * Executes a Bot subscription.
 * @param systemRepo - The system repository.
 * @param job - The subscription job.
 * @param subscription - The subscription.
 * @param resource - The resource that triggered the subscription.
 * @param interaction - The interaction type.
 * @param requestTime - The request time.
 */
async function execBot(
  systemRepo: SystemRepository,
  job: Job<SubscriptionJobData>,
  subscription: WithId<Subscription>,
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
  const bot = await systemRepo.readReference<Bot>({ reference: url });

  const project = subscription.meta?.project as string;
  const requester = resource.meta?.author as Reference<
    Bot | ClientApplication | Patient | Practitioner | RelatedPerson
  >;
  let runAs: WithId<ProjectMembership> | undefined;
  if (bot.runAsUser) {
    runAs = await findProjectMembership(project, requester);
  } else {
    runAs = await findProjectMembership(project, createReference(bot));
  }

  if (!runAs) {
    throw new Error('Could not find project membership for bot');
  }

  const body = interaction === 'delete' ? { deletedResource: resource } : resource;
  const headers = buildRestHookHeaders(job, subscription, resource, interaction, JSON.stringify(body));

  await executeBot({
    subscription,
    bot,
    runAs,
    requester,
    input: body,
    contentType: ContentType.FHIR_JSON,
    requestTime,
    traceId: ctx.traceId,
    headers,
  });
}

async function catchJobError(subscription: Subscription, job: Job<SubscriptionJobData>, err: any): Promise<void> {
  const maxJobAttempts =
    getExtension(subscription, 'https://medplum.com/fhir/StructureDefinition/subscription-max-attempts')
      ?.valueInteger ?? DEFAULT_ATTEMPTS;

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
