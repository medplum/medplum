import { CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { globalLogger } from '../logger';
import { validateCodings } from '../fhir/operations/codesystemvalidatecode';
import { findTerminologyResource } from '../fhir/operations/utils/terminology';
import { OperationOutcomeError, badRequest, mapFilter } from '@medplum/core';

/*
 * The expand worker constructs and stores the full expansion of ValueSet resources,
 * to improve performance of typeahead $expand queries.
 */

export interface ExpandJobData {
  readonly valueSet: ValueSet;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'ExpandQueue';
const jobName = 'ExpandJobData';
let queue: Queue<ExpandJobData> | undefined = undefined;
let worker: Worker<ExpandJobData> | undefined = undefined;

/**
 * Initializes the ValueSet expand worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 * @param config - The Medplum server config to use.
 */
export function initExpandWorker(config: MedplumServerConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<ExpandJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<ExpandJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execExpandJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the expand worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
export async function closeExpandWorker(): Promise<void> {
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
 * Returns the expand queue instance.
 * This is used by the unit tests.
 * @returns The download queue (if available).
 */
export function getExpandQueue(): Queue<ExpandJobData> | undefined {
  return queue;
}

/**
 * Adds an expand job for the given ValueSet.
 * @param valueSet - The ValueSet to expand.
 */
export async function addExpandJob(valueSet: ValueSet): Promise<void> {
  const { requestId, traceId } = getRequestContext();
  await addExpandJobData({ valueSet, requestId, traceId });
}

/**
 * Adds a expand job to the queue.
 * @param job - The expand job details.
 */
async function addExpandJobData(job: ExpandJobData): Promise<void> {
  if (queue) {
    await queue.add(jobName, job);
  }
}

/**
 * Executes a expand job.
 * @param job - The download job details.
 */
export async function execExpandJob(job: Job<ExpandJobData>): Promise<void> {
  const ctx = getRequestContext();
  const { valueSet } = job.data;

  if (!valueSet.compose) {
    return;
  }

  try {
    ctx.logger.info('Expanding ValueSet', { id: valueSet.id });

    const codeSystemCache: Record<string, CodeSystem> = Object.create(null);
    for (const include of valueSet.compose.include) {
      if (!include.system) {
        throw new OperationOutcomeError(
          badRequest('Missing system URL for ValueSet include', 'ValueSet.compose.include.system')
        );
      }

      const codeSystem =
        codeSystemCache[include.system] ?? (await findTerminologyResource('CodeSystem', include.system));
      codeSystemCache[include.system] = codeSystem;
      if (include.concept) {
        const validCodings = await validateCodings(codeSystem, include.concept);
        const codingIds = mapFilter(validCodings, (c) => c?.id);
      } else {
        // await includeInExpansion(include, expansion, codeSystem, params);
      }
    }

    ctx.logger.info('ValueSet expanded successfully', { id: valueSet.id });
  } catch (ex: any) {
    ctx.logger.info('ValueSet expand job exception', ex);
    throw ex;
  }
}
