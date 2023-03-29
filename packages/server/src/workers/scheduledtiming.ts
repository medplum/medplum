import { Resource, Timing } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumRedisConfig } from '../config';
import { logger } from '../logger';

const daysOfWeekConversion = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/*
 * The ScheduleTiming worker inspects resources,
 * looking for external URLs that need to be downloaded.
 *
 * If an external URL is found, the worker attempts to download the content,
 * and use the Medplum server storage service.
 *
 * On successfully downloading the content, the worker updates the resource
 * with the Binary resource.
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
  readonly repeatable: Repeatable;
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
 * Adds a repeatable job to the queue.
 *
 * There are a few important structural considerations:
 * 1) One resource change can spawn multiple download jobs.
 * 2) Download jobs can fail, and must be retried independently.
 * 3) Downloads should be evaluated at the time of the resource change.
 *
 * So, when a resource changes (create or update), we evaluate all downloaders
 * at that moment in time.  For each matching download, we enqueue the job.
 * The only purpose of the job is to make the outbound HTTP request,
 * not to re-evaluate the download.
 *
 * @param resource The resource that was created or updated.
 */
export async function addScheduledTimingJobs(resource: Resource): Promise<void> {
  if (resource.resourceType !== 'Bot') {
    // For now we have only the bot to execute on a timed job
    return;
  }
  if (!resource.scheduledTiming) {
    return;
  }
  const timingToCronFormat = convertTimingToCron(resource.scheduledTiming);

  await addScheduledTimingJobData({
    resourceType: resource.resourceType,
    id: resource.id as string,
    repeatable: timingToCronFormat,
  });
}

async function addScheduledTimingJobData(job: ScheduledTimingJobData): Promise<void> {}

/**
 * BullMQ repeat option, which conducts the job has a cron-parser's pattern
 * @param timing The scheduledTiming property from the bot, which is a Timing Type.
 */
function convertTimingToCron(timing: Timing): Repeatable {
  let minute = '0';
  let hour = '0';
  const dayOfMonth = '*';
  const month = '*';
  let dayOfWeek = '*';

  const repeat = timing.repeat?.period ? timing.repeat.period : 0;
  // Keep it a max rate of Once a minute for the time being
  if (repeat > 24 && repeat < 60) {
    // If more than once an hour we'll need to add to the rate of every Nth min
    const timesAnHour = Math.ceil(60 / repeat);
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
  return { repeat: { pattern: cronPattern } };
}

export async function execBot(job: Job<ScheduledTimingJobData>): Promise<void> {}
