// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobContext, WithId } from '@medplum/core';
import { ContentType, createReference, isGone, isNotFound, normalizeOperationOutcome, resolveId } from '@medplum/core';
import type { Bot, Cron, Project, ProjectMembership, Resource, ResourceType, Timing } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { isValidCron } from 'cron-validator';
import { executeBot } from '../bots/execute';
import { getAllowedProjects } from '../fhir/accesspolicy';
import type { Repository } from '../fhir/repo';
import { getPermittedProjectIds, getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { getLogger, globalLogger } from '../logger';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import {
  defaultQueueOptions,
  findProjectMembership,
  getWorkerBullmqConfig,
  queueRegistry,
  trackJobMetrics,
} from './utils';

const daysOfWeekConversion = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MAX_BOTS_PER_PAGE = 500;

/*
 * The Cron worker inspects resources takes a bot,
 * if it has the Cron property, will add it as a repeatable
 * Cron job
 */

export type CronJobData =
  | {
      readonly resourceType: 'Bot';
      readonly botId: string;
    }
  | {
      readonly resourceType: 'Cron';
      readonly cronId: string;
    };

const queueName = 'CronQueue';

export const initCronWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const queueOptions = defaultQueueOptions(config);
  const queue = new Queue<CronJobData>(queueName, queueOptions);

  let worker: Worker<CronJobData> | undefined;
  if (options?.workerEnabled !== false) {
    worker = new Worker<CronJobData>(
      queueName,
      trackJobMetrics('cron', execBot),
      getWorkerBullmqConfig(config, 'cron', queueOptions)
    );
    worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
    worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
  }

  return { queue, worker, name: queueName };
};

/**
 * Returns the Cron queue instance.
 * This is used by the unit tests.
 * @returns The Cron queue (if available).
 */
export function getCronQueue(): Queue<CronJobData> | undefined {
  return queueRegistry.get(queueName);
}

/**
 * Updates the Cron job for the given resource.
 * Only applies changes if the effective cron string has changed.
 * @param resource - The resource that was created, updated, or deleted.
 * @param previousVersion - The previous version of the resource, if available.
 * @param context - The background job context.
 */
export async function addCronJobs(
  resource: WithId<Resource>,
  previousVersion: Resource | undefined,
  context: BackgroundJobContext
): Promise<void> {
  const queue = queueRegistry.get<CronJobData>(queueName);
  if (!queue) {
    // The queue is not available
    return;
  }

  if (!isSchedulable(resource)) {
    return;
  }

  const logger = getLogger();
  const schedulerId = getSchedulerId(resource);
  const resourceIds = getResourceIds(resource);

  if (context.interaction === 'delete') {
    // A deleted resource can never run again, so drop its schedule without consulting
    // project features -- those may have been turned off since the job was registered.
    logger.info('Removing cron job for deleted resource', { schedulerId, ...resourceIds });
    await queue.removeJobScheduler(schedulerId);
    return;
  }

  // Adding a new feature for project that allows users to add a cron
  const project = context?.project;
  if (!project?.features?.includes('cron')) {
    logger.debug('Cron not enabled. Cron needs to be enabled in project to create cron job for bot');
    return;
  }

  const oldCronStr = isSchedulable(previousVersion) ? getCronString(previousVersion) : undefined;
  const newCronStr = getCronString(resource);
  logger.debug('Cron job for resource', { schedulerId, ...resourceIds, oldCronStr, newCronStr });

  if (oldCronStr === newCronStr) {
    // No change in cron job
    return;
  }

  if (newCronStr) {
    logger.info('Upsert cron job for resource', { schedulerId, ...resourceIds });
    await queue.upsertJobScheduler(
      schedulerId,
      {
        pattern: newCronStr,
      },
      {
        data: buildJobData(resource),
      }
    );
  } else {
    logger.info('Removing cron job for resource', { schedulerId, ...resourceIds });
    await queue.removeJobScheduler(schedulerId);
  }
}

const SCHEDULABLE_TYPES: readonly ResourceType[] = ['Bot', 'Cron'];

function isSchedulable(resource: Resource | undefined): resource is Bot | Cron {
  return resource !== undefined && SCHEDULABLE_TYPES.includes(resource.resourceType);
}

/**
 * Returns the BullMQ job scheduler key for a schedulable resource.
 *
 * Bot keys are the bare resource id, which is what already-registered schedulers use; changing
 * that would orphan every existing job. `Cron` keys are namespaced so the two types can never
 * address each other's schedulers.
 * @param resource - The schedulable resource.
 * @returns The scheduler key.
 */
function getSchedulerId(resource: WithId<Bot> | WithId<Cron>): string {
  return resource.resourceType === 'Cron' ? `Cron/${resource.id}` : resource.id;
}

function getResourceIds(resource: WithId<Bot> | WithId<Cron>): { botId?: string; cronId?: string } {
  return resource.resourceType === 'Cron' ? { cronId: resource.id } : { botId: resource.id };
}

function buildJobData(resource: WithId<Bot> | WithId<Cron>): CronJobData {
  return resource.resourceType === 'Cron'
    ? { resourceType: 'Cron', cronId: resource.id }
    : { resourceType: 'Bot', botId: resource.id };
}

function getCronString(resource: Bot | Cron): string | undefined {
  return resource.resourceType === 'Cron' ? getCronStringForCron(resource) : getCronStringForBot(resource);
}

/**
 * Returns the schedule a `Cron` should currently run on, or `undefined` if it should not run at all.
 *
 * Being inactive or past its end time collapses to the same answer as an unusable schedule, so the
 * ordinary "schedule changed" path in `addCronJobs` removes the job without a separate branch.
 * @param cron - The Cron resource.
 * @returns The cron string, or undefined if the job should not be scheduled.
 */
function getCronStringForCron(cron: Cron): string | undefined {
  if (!cron.active || isPastEndTime(cron) || !isValidCron(cron.cronString)) {
    return undefined;
  }

  return cron.cronString;
}

function isPastEndTime(cron: Cron): boolean {
  return cron.endTime !== undefined && Date.parse(cron.endTime) <= Date.now();
}

/**
 * Returns whether a Cron's project may still run the target bot.
 *
 * A bot is code, not authority, so the target may live in a linked project. The link is what makes
 * that safe, and it is checked here because the worker reads on an unscoped system repo, which
 * would otherwise reach a bot in any project at all.
 * @param cronProject - The project owning the Cron that names the bot.
 * @param bot - The bot the Cron targets.
 * @returns True if the bot's project is the Cron's own or a link that exports Bot.
 */
async function canCronReadBot(cronProject: WithId<Project>, bot: Bot): Promise<boolean> {
  const botProjectId = bot.meta?.project;
  if (!botProjectId) {
    return false;
  }
  if (botProjectId === cronProject.id) {
    return true;
  }

  const permitted = getPermittedProjectIds(await getAllowedProjects(cronProject), 'Bot');
  return !permitted || permitted.includes(botProjectId);
}

function getCronStringForBot(bot: Bot | undefined): string | undefined {
  if (bot?.cronTiming) {
    const timingStr = convertTimingToCron(bot.cronTiming);
    if (timingStr) {
      return timingStr;
    }
  }

  if (bot?.cronString && isValidCron(bot.cronString)) {
    return bot.cronString;
  }

  // Otherwise, this is not a valid cron job
  return undefined;
}

/**
 * BullMQ repeat option, which conducts the job has a cron-parser's pattern
 * @param timing - The Cron property from the bot, which is a Timing Type.
 * @returns The cron string.
 */
export function convertTimingToCron(timing: Timing): string | undefined {
  let minute = '0';
  let hour = '*';
  // The timing input doesn't have a feature for this
  const dayOfMonth = '*';
  // The timing input doesn't have a feature for this
  const month = '*';
  let dayOfWeek = '*';

  if (!timing.repeat) {
    return undefined;
  }

  // if period isn't available, we'll have it at 1
  const repeat = timing.repeat.period ? timing.repeat.period : 1;

  // Keep it a max rate of Once a minute for the time being
  if (repeat > 24 && repeat < 60) {
    // If more than once an hour we'll need to add to the rate of every Nth min
    const timesAnHour = Math.ceil((24 * 60) / repeat);
    minute = `*/${timesAnHour}`;
  } else {
    const timesADay = Math.ceil(24 / repeat);
    hour = `*/${timesADay}`;
  }

  // Days of the week
  const days = timing.repeat.dayOfWeek;
  if (days) {
    const daysCronFormat = [];
    for (const day of days) {
      daysCronFormat.push(daysOfWeekConversion[day]);
    }
    dayOfWeek = daysCronFormat.join(',');
  }
  return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
}

/**
 * Reads a resource a registered job depends on, treating one that is gone as `undefined`.
 *
 * A deleted resource never comes back, so the caller can stop the job; any other failure
 * propagates, so a transient read error retries rather than costing the schedule.
 * @param read - Reads the resource.
 * @returns The resource, or undefined if it no longer exists.
 */
async function readIfPresent<T extends Resource>(read: () => Promise<WithId<T>>): Promise<WithId<T> | undefined> {
  try {
    return await read();
  } catch (err: unknown) {
    const outcome = normalizeOperationOutcome(err);
    if (isNotFound(outcome) || isGone(outcome)) {
      return undefined;
    }
    throw err;
  }
}

async function unregisterCronJob(cron: WithId<Cron>, reason: string): Promise<void> {
  getLogger().warn('Unregistering cron job', { cronId: cron.id, reason });
  await removeBullMQJobByKey(getSchedulerId(cron));
}

/**
 * Resolves what a Cron tick needs in order to run, or stops the job and returns undefined.
 *
 * Edits go through `addCronJobs`, but a registered job can be invalidated with nobody touching it:
 * an end time passes, a link is revoked, the target or the identity is deleted, or the project
 * loses the `cron` feature. None recover on a retry, so they are resolved here rather than failing
 * on every tick.
 * @param systemRepo - System repository, which reads across every project.
 * @param cronId - The Cron to resolve.
 * @returns The bot, the membership to run as, and the Cron; or undefined if the tick should not run.
 */
async function resolveCronJob(
  systemRepo: Repository,
  cronId: string
): Promise<{ bot: WithId<Bot>; runAs: WithId<ProjectMembership>; cron: WithId<Cron> } | undefined> {
  const cron = await systemRepo.readResource<Cron>('Cron', cronId);

  if (!getCronStringForCron(cron)) {
    await unregisterCronJob(cron, 'the schedule no longer runs');
    return undefined;
  }

  const projectId = cron.meta?.project;
  const project = projectId
    ? await readIfPresent(() => systemRepo.readResource<Project>('Project', projectId))
    : undefined;
  if (!project) {
    await unregisterCronJob(cron, 'its project could not be read');
    return undefined;
  }

  if (!project.features?.includes('cron')) {
    // addCronJobs refuses to register without the feature, so a job that outlived it must not run.
    // The schedule stays registered: the feature can come back, and nothing re-registers a dropped
    // job, so unregistering would strand the Cron.
    getLogger().info('Skipping cron job, project does not have the cron feature', {
      cronId: cron.id,
      projectId: project.id,
    });
    return undefined;
  }

  const bot = await readIfPresent(() => systemRepo.readReference<Bot>(cron.targetReference));
  if (!bot) {
    await unregisterCronJob(cron, 'its target bot no longer exists');
    return undefined;
  }

  if (!(await canCronReadBot(project, bot))) {
    // The write path authorized this target, so the link must have been revoked or narrowed since.
    await unregisterCronJob(cron, 'its target bot is no longer readable');
    return undefined;
  }

  const runAs = await readIfPresent(() => systemRepo.readReference<ProjectMembership>(cron.onBehalfOf));
  if (!runAs) {
    await unregisterCronJob(cron, 'its onBehalfOf membership no longer exists');
    return undefined;
  }

  if (resolveId(runAs.project) !== project.id) {
    // onBehalfOf picks the access policy the run assumes, so it never crosses a project boundary --
    // otherwise a Cron could borrow the privileges of a membership elsewhere. The write path
    // rejects this, so reaching it means the Cron arrived some other way: fail loudly.
    throw new Error('Cron onBehalfOf membership belongs to a different project');
  }

  return { bot, runAs, cron };
}

export async function execBot(job: Job<CronJobData>): Promise<void> {
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be part of job.data in the future

  let bot: WithId<Bot>;
  let runAs: WithId<ProjectMembership> | undefined;
  let input: unknown;

  if (job.data.resourceType === 'Cron') {
    const resolved = await resolveCronJob(systemRepo, job.data.cronId);
    if (!resolved) {
      return;
    }
    bot = resolved.bot;
    runAs = resolved.runAs;
    // The whole Cron goes to the target, so a bot reads its parameters alongside the schedule
    input = resolved.cron;
  } else {
    bot = await systemRepo.readReference<Bot>({ reference: 'Bot/' + job.data.botId });
    runAs = await findProjectMembership(bot.meta?.project as string, createReference(bot));
    input = bot;
  }

  if (!runAs) {
    throw new Error('Could not find project membership for bot');
  }

  await executeBot({ bot, runAs, input, contentType: ContentType.FHIR_JSON });
}

export async function removeBullMQJobByKey(schedulerId: string): Promise<void> {
  const queue = queueRegistry.get(queueName);
  if (queue) {
    await queue.removeJobScheduler(schedulerId);
  }
}

export async function reloadCronBots(): Promise<void> {
  const queue = queueRegistry.get(queueName);
  if (queue) {
    // Clears all jobs from the cron queue, including active ones
    await queue.obliterate({ force: true });

    const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be a function parameter in the future

    await systemRepo.processAllResources<Bot>(
      { resourceType: 'Bot', count: MAX_BOTS_PER_PAGE },
      async (bot) => {
        // If the bot has a cron, then add a scheduler for it
        if (bot.cronString || bot.cronTiming) {
          // We pass `undefined` as previous version to make sure that the latest cron string is used
          const project = await systemRepo.readResource<Project>('Project', bot.meta?.project as string);
          await addCronJobs(bot, undefined, { project, interaction: 'update' });
        }
      },
      { delayBetweenPagesMs: 1000 }
    );

    // `obliterate` above cleared Cron schedules too, so they have to be re-registered here or
    // every Cron resource silently stops running after a reload.
    await systemRepo.processAllResources<Cron>(
      { resourceType: 'Cron', count: MAX_BOTS_PER_PAGE },
      async (cron) => {
        if (cron.active) {
          const project = await systemRepo.readResource<Project>('Project', cron.meta?.project as string);
          await addCronJobs(cron, undefined, { project, interaction: 'update' });
        }
      },
      { delayBetweenPagesMs: 1000 }
    );
  }
}
