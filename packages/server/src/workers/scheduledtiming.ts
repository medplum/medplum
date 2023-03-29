import { createReference, Operator } from '@medplum/core';
import { AuditEvent, Bot, Practitioner, ProjectMembership, Reference, Resource, Timing } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumRedisConfig } from '../config';
import { executeBot } from '../fhir/operations/execute';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { AuditEventOutcome } from '../util/auditevent';
import { isValidCron } from 'cron-validator';

const daysOfWeekConversion = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/*
 * The ScheduleTiming worker inspects resources takes a bot,
 * if it has the scheduledTiming property, will add it as a repeatable
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

export interface ScheduledTimingJobData {
  readonly resourceType: string;
  readonly id: string;
}

const queueName = 'ScheduledTimingQueue';
const jobName = 'ScheduledTimingJobData';

let queue: Queue<ScheduledTimingJobData> | undefined = undefined;
let worker: Worker<ScheduledTimingJobData> | undefined = undefined;

/**
 * Initializes the scheduled timing worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 */
export function initScheduledTimingWorker(config: MedplumRedisConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config,
  };

  queue = new Queue<ScheduledTimingJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });
  worker = new Worker<ScheduledTimingJobData>(queueName, execBot, defaultOptions);
  worker.on('completed', (job) => logger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => logger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the ScheduledTiming worker.
 * Closes the BullMQ job queue.
 * Clsoes the BullMQ worker.
 */
export async function closeScheduledTimingWorker(): Promise<void> {
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
 * Returns the ScheduledTiming queue instance.
 * This is used by the unit tests.
 * @returns The ScheduledTiming queue (if available).
 */
export function getScheduledTimingQueue(): Queue<ScheduledTimingJobData> | undefined {
  return queue;
}

/**
 * @param resource The resource that was created or updated.
 */
export async function addScheduledTimingJobs(resource: Resource): Promise<void> {
  if (resource.resourceType !== 'Bot') {
    // For now we have only the bot to execute on a timed job
    return;
  }
  let cron;
  // Validate the cron format
  if (resource.cronTiming) {
    cron = convertTimingToCron(resource.cronTiming);
    if (!cron) {
      return;
    }
  } else {
    if (resource.cronString && isValidCron(resource.cronString)) {
      cron = resource.cronString;
    } else {
      return;
    }
  }
  if (!cron) {
    return;
  }
  const cronObject = { repeat: { pattern: cron } };

  // JobId and repeatable instructions
  const jobOptions = { ...cronObject, jobId: resource.id };
  await addScheduledTimingJobData(
    {
      resourceType: resource.resourceType,
      id: resource.id as string,
    },
    jobOptions
  );
}

/**
 * Adds a scheduled timing job to the queue, and removes the previous job for bot
 * if it exists
 * @param job The scheduled timing job details.
 * @param repeatable The repeat format that instructs BullMQ when to run the job
 */
async function addScheduledTimingJobData(job: ScheduledTimingJobData, repeatable: Repeatable): Promise<void> {
  // Check if there was a job previously for this bot, if there was, we remove it.
  const previousJob = await queue?.getJob(job.id);
  if (previousJob) {
    logger.debug(`Found a previous job for bot ${job.id}, updating...`);
    await previousJob.remove();
  }
  logger.debug('Adding Scheduled Timing job');
  // Parameters of queue.add https://api.docs.bullmq.io/classes/Queue.html#add
  if (queue) {
    await queue.add(jobName, job, repeatable);
  } else {
    logger.debug('Scheduled Timing queue not initialized');
  }
}

/**
 * BullMQ repeat option, which conducts the job has a cron-parser's pattern
 * @param timing The scheduled timing property from the bot, which is a Timing Type.
 */
export function convertTimingToCron(timing: Timing): string | undefined {
  let minute = '*';
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
  const repeat = timing.repeat?.period ? timing.repeat.period : 1;

  // Keep it a max rate of Once a minute for the time being
  if (repeat > 24 && repeat < 60) {
    // If more than once an hour we'll need to add to the rate of every Nth min
    const timesAnHour = Math.ceil((24 * 60) / repeat);
    minute = `*/${timesAnHour}`;
  } else {
    const timesADay = Math.ceil(24 / repeat);
    minute = '0';
    hour = `*/${timesADay}`;
  }

  // Days of the week
  const days = timing.repeat?.dayOfWeek ? timing.repeat.dayOfWeek : undefined;
  if (days) {
    const daysCronFormat = [];
    for (const day of days) {
      daysCronFormat.push(daysOfWeekConversion[day]);
    }
    dayOfWeek = daysCronFormat.join(',');
  }
  const cronPattern = `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
  return cronPattern;
}

export async function execBot(job: Job<ScheduledTimingJobData>): Promise<void> {
  const startTime = new Date().toISOString();
  const bot = await systemRepo.readReference<Bot>({ reference: job.id });
  const project = bot.meta?.project as string;

  const runAs = await findProjectMembership(project, createReference(bot));

  if (!runAs) {
    throw new Error('Could not find project membership for bot');
  }

  let outcome: AuditEventOutcome;
  let logResult: string;
  try {
    const result = await executeBot({ bot, runAs, input: bot, contentType: 'application/fhir+json' });
    outcome = result.success ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure;
    logResult = result.logResult;
  } catch (error) {
    outcome = AuditEventOutcome.MajorFailure;
    logResult = (error as Error).message;
  }
  await createAuditEventForScheduledJob(bot, startTime, outcome, logResult);
}

async function findProjectMembership(project: string, profile: Reference): Promise<ProjectMembership | undefined> {
  const bundle = await systemRepo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 1,
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: `Project/${project}`,
      },
      {
        code: 'profile',
        operator: Operator.EQUALS,
        value: profile.reference as string,
      },
    ],
  });
  return bundle.entry?.[0]?.resource;
}

/**
 * Creates an AuditEvent for a scheduled timing job attempt.
 * @param bot The bot that triggered the job.
 * @param startTime The time the subscription attempt started.
 * @param outcome The outcome code.
 * @param outcomeDesc The outcome description text.
 */
// console.log("if i forget to ask, don't PR")
async function createAuditEventForScheduledJob(
  bot: Bot,
  startTime: string,
  outcome: AuditEventOutcome,
  outcomeDesc?: string
): Promise<void> {
  const entity = [
    {
      what: createReference(bot),
      role: { code: '', display: 'Domain' },
    },
  ];

  await systemRepo.createResource<AuditEvent>({
    resourceType: 'AuditEvent',
    meta: {
      project: bot.meta?.project,
      account: bot.meta?.account,
    },
    period: {
      start: startTime,
      end: new Date().toISOString(),
    },
    recorded: new Date().toISOString(),
    type: {
      code: 'transmit',
    },
    agent: [
      {
        type: {
          text: 'scheduled timing job',
        },
        requestor: false,
      },
    ],
    source: {
      observer: createReference(bot) as Reference as Reference<Practitioner>,
    },
    entity,
    outcome,
    outcomeDesc,
  });
}
