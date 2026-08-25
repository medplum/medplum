// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobContext, WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type {
  Bot,
  Cron,
  Parameters,
  Project,
  ProjectMembership,
  Resource,
  ResourceType,
  Timing,
} from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { isValidCron } from 'cron-validator';
import { executeBot } from '../bots/execute';
import { getShardSystemRepo } from '../fhir/repo';
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

export async function execBot(job: Job<CronJobData>): Promise<void> {
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be part of job.data in the future

  let bot: WithId<Bot>;
  let runAs: WithId<ProjectMembership> | undefined;
  let input: unknown;

  if (job.data.resourceType === 'Cron') {
    const cron = await systemRepo.readResource<Cron>('Cron', job.data.cronId);
    if (!getCronStringForCron(cron)) {
      // Edits go through addCronJobs, but nothing fires when an end time merely passes, so a job
      // that can no longer run unregisters itself on its next tick.
      await removeBullMQJobByKey(getSchedulerId(cron));
      return;
    }

    bot = await systemRepo.readReference<Bot>(cron.targetReference);

    if (bot.meta?.project !== cron.meta?.project) {
      throw new Error('Cron target bot belongs to a different project');
    }

    runAs = await systemRepo.readReference<ProjectMembership>(cron.onBehalfOf);
    if (runAs.project?.reference !== `Project/${cron.meta?.project}`) {
      throw new Error('Cron onBehalfOf membership belongs to a different project');
    }

    input = cron.parameter ? ({ resourceType: 'Parameters', parameter: cron.parameter } satisfies Parameters) : cron;
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
