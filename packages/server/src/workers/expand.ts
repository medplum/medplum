import { CodeSystem, ValueSet } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { globalLogger } from '../logger';
import { validateCodings } from '../fhir/operations/codesystemvalidatecode';
import { OperationOutcomeError, badRequest, flatMapFilter } from '@medplum/core';
import { Column, Condition, InsertQuery, SelectQuery } from '../fhir/sql';
import { DatabaseMode, getDatabasePool } from '../database';
import { expansionQuery, isExpansionPrecomputed } from '../fhir/operations/expand';

/*
 * The expand worker constructs and stores the full expansion of ValueSet resources,
 * to improve performance of typeahead $expand queries.
 */

export interface ExpandJobData {
  readonly valueSet: ValueSet;
  readonly terminologyResources: Record<string, CodeSystem | ValueSet>;
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
  worker.on('failed', (job, err) => globalLogger.error(`Failed job ${job?.id} with ${err}`));
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
 * @param terminologyResources - Referenced CodeSystem resources for the expansion.
 */
export async function addExpandJob(
  valueSet: ValueSet,
  terminologyResources: Record<string, CodeSystem | ValueSet>
): Promise<void> {
  const { requestId, traceId } = getRequestContext();
  await addExpandJobData({ valueSet, terminologyResources, requestId, traceId });
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
 * @param job - The expand job details.
 */
export async function execExpandJob(job: Job<ExpandJobData>): Promise<void> {
  const ctx = getRequestContext();
  const { valueSet, terminologyResources } = job.data;

  try {
    ctx.logger.info('Expanding ValueSet', { id: valueSet.id });
    if (await isExpansionPrecomputed(valueSet)) {
      return;
    }

    await expand(valueSet, terminologyResources);

    ctx.logger.info('ValueSet expanded successfully', { id: valueSet.id });
  } catch (ex: any) {
    ctx.logger.error('ValueSet expand job exception', ex);
    throw ex;
  }
}

async function expand(
  valueSet: ValueSet,
  terminologyResources: Record<string, CodeSystem | ValueSet>,
  additionalValueSetIds?: string[]
): Promise<void> {
  if (!valueSet.id) {
    throw new OperationOutcomeError(badRequest('ValueSet missing ID'));
  }
  if (!valueSet.compose?.include.length) {
    return;
  }

  for (const include of valueSet.compose.include) {
    const valueSetIds = additionalValueSetIds?.length ? [...additionalValueSetIds, valueSet.id] : [valueSet.id];
    if (include.valueSet) {
      for (const url of include.valueSet) {
        const nestedValueSet = terminologyResources[url] as ValueSet;
        await expand(nestedValueSet, terminologyResources, valueSetIds);
      }
      continue;
    }

    if (!include.system) {
      throw new OperationOutcomeError(
        badRequest('Missing system URL for ValueSet include', 'ValueSet.compose.include.system')
      );
    }

    const codeSystem = terminologyResources[include.system as string] as CodeSystem;
    if (include.concept) {
      const validCodings = await validateCodings(codeSystem, include.concept);
      const mappings = flatMapFilter(validCodings, (c) =>
        c?.id ? valueSetIds.map((vsId) => ({ valueSet: vsId, coding: c.id })) : undefined
      );
      await new InsertQuery('ValueSet_Membership', mappings)
        .ignoreOnConflict()
        .execute(getDatabasePool(DatabaseMode.WRITER));
    } else {
      const query = expansionQuery(include, codeSystem);
      if (query) {
        const rowQuery = new SelectQuery('expansion', query);
        const vsid = rowQuery.getNextJoinAlias();
        rowQuery
          // Insert a row for each ValueSet the includes this code
          .innerJoin('ValueSet', vsid, new Condition(new Column(vsid, 'id'), 'IN', valueSetIds))
          .column(new Column(vsid, 'id'))
          .column(new Column('expansion', 'id'));

        const writeQuery = new InsertQuery('ValueSet_Membership', rowQuery).ignoreOnConflict();
        await writeQuery.execute(getDatabasePool(DatabaseMode.WRITER));
      }
    }
  }
}
