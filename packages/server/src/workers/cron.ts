import { ContentType, createReference } from '@medplum/core';
import { Bot, Project, Resource, Timing } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { isValidCron } from 'cron-validator';
import { MedplumServerConfig } from '../config';
import { getLogger } from '../context';
import { executeBot } from '../fhir/operations/execute';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { findProjectMembership } from './utils';

const daysOfWeekConversion = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/*
 * The Cron worker inspects resources takes a bot,
 * if it has the Cron property, will add it as a repeatable
 * Cron job
 */
// Repeatable is based on BullMQ docs https://docs.bullmq.io/guide/jobs/repeatable
interface Repeatable {
  repeat: {
    pattern?: string;
    every?: number;
    limit?: number;
  };
  jobId?: string;
}

export interface CronJobData {
  readonly resourceType: string;
  readonly botId: string;
}

const queueName = 'CronQueue';
const jobName = 'CronJobData';

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
 * Returns the Cron queue instance.
 * This is used by the unit tests.
 * @returns The Cron queue (if available).
 */
export function getCronQueue(): Queue<CronJobData> | undefined {
  return queue;
}

/**
 * @param resource - The resource that was created or updated.
 */
export async function addCronJobs(resource: Resource): Promise<void> {
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

  let cron;
  // Validate the cron format
  if (bot.cronTiming) {
    cron = convertTimingToCron(bot.cronTiming);
    if (!cron) {
      logger.debug('cronTiming had the wrong format for a timed cron job');
      return;
    }
  } else if (bot.cronString && isValidCron(bot.cronString)) {
    cron = bot.cronString;
  } else if (bot.cronString === '') {
    await removeBullMQJobByKey(bot.id as string);
    logger.debug(`no job for bot: ${bot.id}`);
    return;
  } else {
    logger.debug('cronString had the wrong format for a timed cron job');
    return;
  }

  const cronObject = { repeat: { pattern: cron } };

  // JobId and repeatable instructions
  const jobOptions = { ...cronObject, jobId: bot.id };
  await addCronJobData(
    {
      resourceType: bot.resourceType,
      botId: bot.id as string,
    },
    jobOptions
  );
}

/**
 * Adds a Cron job to the queue, and removes the previous job for bot
 * if it exists
 * @param job - The Cron job details.
 * @param repeatable - The repeat format that instructs BullMQ when to run the job
 */
async function addCronJobData(job: CronJobData, repeatable: Repeatable): Promise<void> {
  // Check if there was a job previously for this bot, if there was, we remove it.
  await removeBullMQJobByKey(job.botId);
  // Parameters of queue.add https://api.docs.bullmq.io/classes/Queue.html#add
  if (queue) {
    await queue.add(jobName, job, repeatable);
  }
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
  const previousJobs = (await queue?.getRepeatableJobs())?.filter((p) => p.id === botId) ?? [];

  // There likely should not be more than one repeatable job per bot id.
  for (const p of previousJobs) {
    await queue?.removeRepeatableByKey(p.key);
    getLogger().debug(`Found a previous job for bot ${botId}, updating...`);
  }
}
