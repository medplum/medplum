import { ContentType, createReference } from '@medplum/core';
import { Bot, Project, Resource, Timing } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { isValidCron } from 'cron-validator';
import { MedplumServerConfig } from '../config';
import { executeBot } from '../fhir/operations/execute';
import { getSystemRepo } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { findProjectMembership } from './utils';

const daysOfWeekConversion = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MAX_BOTS_PER_PAGE = 500;

/*
 * The Cron worker inspects resources takes a bot,
 * if it has the Cron property, will add it as a repeatable
 * Cron job
 */

export interface CronJobData {
  readonly resourceType: string;
  readonly botId: string;
}

const queueName = 'CronQueue';

let queue: Queue<CronJobData> | undefined = undefined;
let worker: Worker<CronJobData> | undefined = undefined;

/**
 * Initializes the Cron worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 * @param config - The Medplum server config to use.
 */
export function initCronWorker(config: MedplumServerConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<CronJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<CronJobData>(queueName, execBot, {
    ...defaultOptions,
    ...config.bullmq,
  });
  worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the Cron worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
export async function closeCronWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = undefined;
  }

  if (queue) {
    await queue.close();
    queue = undefined;
  }
}

/**
 * Returns the Cron queue instance.
 * This is used by the unit tests.
 * @returns The Cron queue (if available).
 */
export function getCronQueue(): Queue<CronJobData> | undefined {
  return queue;
}

/**
 * Updates the Cron job for the given resource.
 * Only applies changes if the effective cron string has changed.
 * @param resource - The resource that was created or updated.
 * @param previousVersion - The previous version of the resource, if available.
 */
export async function addCronJobs(resource: Resource, previousVersion: Resource | undefined): Promise<void> {
  if (!queue) {
    // The queue is not available
    return;
  }

  if (resource.resourceType !== 'Bot') {
    // For now we have only the bot to execute on a timed job
    return;
  }

  const logger = getLogger();
  const bot = resource;

  // Adding a new feature for project that allows users to add a cron
  const systemRepo = getSystemRepo();
  const project = await systemRepo.readResource<Project>('Project', resource.meta?.project as string);
  if (!project.features?.includes('cron')) {
    logger.debug('Cron not enabled. Cron needs to be enabled in project to create cron job for bot');
    return;
  }

  const oldCronStr = getCronStringForBot(previousVersion as Bot);
  const newCronStr = getCronStringForBot(bot);
  logger.info('Cron job for bot', { botId: bot.id, oldCronStr, newCronStr });

  if (oldCronStr === newCronStr) {
    // No change in cron job
    return;
  }

  if (newCronStr) {
    logger.info('Upsert cron job for bot', { botId: bot.id });
    await queue.upsertJobScheduler(
      bot.id as string,
      {
        pattern: newCronStr,
      },
      {
        data: {
          resourceType: bot.resourceType,
          botId: bot.id as string,
        },
      }
    );
  } else {
    logger.info('Removing cron job for bot', { botId: bot.id });
    await queue.removeJobScheduler(bot.id as string);
  }
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
  const days = timing.repeat.dayOfWeek ? timing.repeat.dayOfWeek : undefined;
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
  const systemRepo = getSystemRepo();
  const bot = await systemRepo.readReference<Bot>({ reference: 'Bot/' + job.data.botId });
  const project = bot.meta?.project as string;
  const runAs = await findProjectMembership(project, createReference(bot));

  if (!runAs) {
    throw new Error('Could not find project membership for bot');
  }

  await executeBot({ bot, runAs, input: bot, contentType: ContentType.FHIR_JSON });
}

export async function removeBullMQJobByKey(botId: string): Promise<void> {
  if (queue) {
    await queue.removeJobScheduler(botId);
  }
}

export async function reloadCronBots(): Promise<void> {
  if (queue) {
    // Clears all jobs from the cron queue, including active ones
    await queue.obliterate({ force: true });

    await getSystemRepo().processAllResources<Bot>(
      { resourceType: 'Bot', count: MAX_BOTS_PER_PAGE },
      async (bot: Bot) => {
        // If the bot has a cron, then add a scheduler for it
        if (bot.cronString || bot.cronTiming) {
          // We pass `undefined` as previous version to make sure that the latest cron string is used
          await addCronJobs(bot, undefined);
        }
      },
      { delayBetweenPagesMs: 1000 }
    );
  }
}
