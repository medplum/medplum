// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger, WithId } from '@medplum/core';
import {
  ContentType,
  createReference,
  getReferenceString,
  isOk,
  normalizeErrorString,
  OperationOutcomeError,
  serverError,
} from '@medplum/core';
import type { BatchInitialState, FhirRequest } from '@medplum/fhir-router';
import { BatchProcessor, buildBatchResponseBundle, FhirRouter } from '@medplum/fhir-router';
import type { AsyncJob, Binary, Bundle, Parameters, UserConfiguration } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { DelayedError, Queue, Worker } from 'bullmq';
import { getUserConfiguration } from '../auth/me';
import { getAuthenticatedContext, runInAuthenticatedContext } from '../context';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { BatchCheckpointStore } from '../fhir/batch/checkpoint-store';
import { uploadBinaryData } from '../fhir/binary';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import type { Repository, SystemRepository } from '../fhir/repo';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { getLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import {
  addVerboseQueueLogging,
  defaultQueueOptions,
  getWorkerBullmqConfig,
  isJobActive,
  moveToDelayedAndThrow,
  queueRegistry,
  updateAsyncJobOutput,
} from './utils';

/*
 * The batch worker runs a batch asynchronously, decoupled from an individual HTTP request.
 *
 * Processing is RE-ENTRANT so that a large batch survives server deploys and worker crashes
 * (see https://github.com/medplum/medplum/issues/9681). Rather than processing the whole bundle in
 * a single call, the worker drives the BatchProcessor one entry at a time and periodically
 * checkpoints its in-flight state to durable object storage (see BatchCheckpointStore). On a
 * graceful shutdown the job is delayed and re-queued; on resume the processor is rehydrated from
 * durable state and continues from the last checkpoint.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ AT-LEAST-ONCE / REPLAY WINDOW — READ BEFORE CHANGING CHECKPOINT LOGIC                        │
 * │                                                                                             │
 * │ Each entry's database side-effects are committed BEFORE its result is checkpointed to       │
 * │ durable storage. If a worker crashes (hard crash or the process is killed) after an entry's │
 * │ side-effects commit but before the next checkpoint, that entry is re-processed when the job │
 * │ resumes. Async batch processing is therefore AT-LEAST-ONCE per entry, NOT exactly-once.     │
 * │                                                                                             │
 * │ The replay window is bounded by the checkpoint cadence (BatchJobData.checkpointEntries      │
 * │ entries OR .checkpointIntervalMs milliseconds, whichever comes first). Entries that are      │
 * │ inherently NON-IDEMPOTENT — e.g. some PATCH operations (array insert/append) and plain POST │
 * │ creates — may be applied more than once if a crash occurs within that window. A replayed    │
 * │ POST create reuses the resource id assigned during preprocessing (persisted in the initial  │
 * │ state), so depending on the create path it may upsert or conflict; the result recorded on   │
 * │ replay reflects the replay attempt, not the original.                                       │
 * │                                                                                             │
 * │ This trade-off is intentional: we do NOT rewrite entries to force idempotency. Shrinking    │
 * │ the checkpoint thresholds shrinks the window at the cost of more object-storage writes.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 */

interface BaseBatchJobData {
  readonly authState: Readonly<AuthState>;
  readonly requestId?: string;
  readonly traceId?: string;
}

export interface LegacyBatchJobData extends BaseBatchJobData {
  readonly asyncJob: WithId<AsyncJob>;
  readonly bundle: Bundle;
}

export interface ReentrantBatchJobData extends BaseBatchJobData {
  readonly asyncJobId: string;
  /**
   * Index into the preprocessed ordering of the next entry to process. `undefined` on the initial
   * enqueue (before the bundle has been preprocessed). Updated via `job.updateData` at each
   * checkpoint so that a resumed/re-queued job continues from the last checkpoint.
   */
  readonly position?: number;
  /** Number of result chunks written to durable storage so far. */
  readonly chunkSeq?: number;

  // Configurable checkpoint cadence. A checkpoint is taken whenever EITHER threshold is reached,
  // whichever comes first (see the replay-window note above). Left unset, the defaults below apply.
  /** Max number of entries processed between checkpoints. Defaults to {@link defaultCheckpointEntries}. */
  readonly checkpointEntries?: number;
  /** Max milliseconds elapsed between checkpoints. Defaults to {@link defaultCheckpointIntervalMs}. */
  readonly checkpointIntervalMs?: number;
}

export type BatchJobData = LegacyBatchJobData | ReentrantBatchJobData;

const queueName = 'BatchQueue';
const jobName = 'BatchJobData';

const defaultCheckpointEntries = 10;
const defaultCheckpointIntervalMs = 5000;

export const initBatchWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const defaultOptions = defaultQueueOptions(config);
  const queue = new Queue<BatchJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      ...defaultOptions.defaultJobOptions,
      attempts: 1,
    },
  });

  let worker: Worker<BatchJobData> | undefined;
  if (options?.workerEnabled !== false) {
    const workerBullmq = getWorkerBullmqConfig(config, 'batch');
    worker = new Worker<BatchJobData>(
      queueName,
      (job) => {
        const { authState, requestId, traceId } = job.data;
        return runInAuthenticatedContext(authState, requestId, traceId, { async: true }, () => {
          if ('asyncJob' in job.data) {
            return execLegacyBatchJob(job as Job<LegacyBatchJobData>);
          } else if ('asyncJobId' in job.data) {
            return execBatchJob(job as Job<ReentrantBatchJobData>);
          } else {
            throw new TypeError('Unrecognized BatchJobData', { cause: job.data });
          }
        });
      },
      {
        ...defaultOptions,
        concurrency: 1,
        ...workerBullmq,
      }
    );

    worker.on('failed', async (job, failedErr) => {
      if (!job) {
        return;
      }

      // A delayed/re-queued job is not a failure; nothing to do.
      if (failedErr instanceof DelayedError) {
        return;
      }

      // This fires only when the job could not be recovered by re-entrant resume (e.g. it stalled
      // more than maxStalledCount times). Mark the AsyncJob failed if it is still in progress and
      // clean up any durable checkpoint state.

      if ('asyncJob' in job.data && job.data.asyncJob) {
        job.data satisfies LegacyBatchJobData;
        const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be available in job.data.authState in the future
        const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
        await exec.failJob();
        return;
      } else if (!('asyncJobId' in job.data) || !job.data.asyncJobId) {
        getLogger().error('Unrecognized BatchJobData', { jobData: job.data });
        return;
      }

      job.data satisfies ReentrantBatchJobData;
      try {
        const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be available in job.data.authState in the future
        const asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', job.data.asyncJobId);
        if (isJobActive(asyncJob)) {
          await new AsyncJobExecutor(systemRepo, asyncJob).failJob(failedErr ?? undefined);
        }
      } finally {
        const logger = getBatchLogger(job.data.asyncJobId, job.id);
        const store = new BatchCheckpointStore(job.data.asyncJobId, logger);
        await store.cleanup(job.data.chunkSeq ?? 0);
      }
    });
    addVerboseQueueLogging<BatchJobData>(queue, worker, (job) => {
      const asyncJobRef = 'asyncJob' in job.data ? job.data.asyncJob : { id: job.data.asyncJobId };
      return {
        subsystem: BATCH_LOGGER_SUBSYSTEM,
        asyncJob: getReferenceString(asyncJobRef),
        project: getReferenceString(job.data.authState.project),
        profile: job.data.authState.profile && getReferenceString(job.data.authState.profile),
        membership: getReferenceString(job.data.authState.membership),
        onBehalfOf: job.data.authState.onBehalfOf && getReferenceString(job.data.authState.onBehalfOf),
        onBehalfOfMembership:
          job.data.authState.onBehalfOfMembership && getReferenceString(job.data.authState.onBehalfOfMembership),
      };
    });
  }

  return { queue, worker, name: queueName };
};

/**
 * Returns the batch queue instance.
 * This is used by the unit tests.
 * @returns The batch queue (if available).
 */
export function getBatchQueue(): Queue<BatchJobData> | undefined {
  return queueRegistry.get(queueName);
}

/**
 * Adds a batch job to the queue.
 * @param jobData - The batch job details.
 * @returns The enqueued job.
 */
async function addBatchJobData(jobData: ReentrantBatchJobData): Promise<Job<BatchJobData>> {
  const queue = queueRegistry.get<BatchJobData>(queueName);
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add(jobName, jobData);
}

export async function queueBatchProcessing(bundle: Bundle, asyncJob: WithId<AsyncJob>): Promise<Job<BatchJobData>> {
  const { authentication: authState, requestId, traceId } = getAuthenticatedContext();
  // Persist the (potentially large) input bundle to durable object storage rather than carrying it
  // in the BullMQ job data (see https://github.com/medplum/medplum/issues/9124). The worker loads
  // it on the first run to preprocess.
  await new BatchCheckpointStore(asyncJob.id, getBatchLogger(asyncJob.id)).saveInputBundle(bundle);
  return addBatchJobData({ asyncJobId: asyncJob.id, authState, requestId, traceId });
}

/**
 * Builds the submitting user's repository for processing batch entries.
 * @param authState - The auth state captured when the batch was submitted.
 * @param userConfig - The user's configuration.
 * @returns The user's repository.
 */
async function getBatchUserRepo(authState: Readonly<AuthState>, userConfig: UserConfiguration): Promise<Repository> {
  const { login, project, membership } = authState;
  return getRepoForLogin({ login, project, membership, userConfig }, true);
}

/**
 * Executes a re-entrant batch job.
 *
 * On the first run the input bundle is loaded from durable storage, preprocessed, and its initial
 * state is persisted. Entries are then processed one at a time, checkpointing progress and results
 * to durable storage. If the queue is closing (graceful shutdown), the job is delayed and re-queued
 * to resume later. On resume, the processor is rehydrated from durable state and continues from the
 * last checkpoint.
 *
 * All errors other than {@link DelayedError} are handled here (the AsyncJob is failed and durable
 * state cleaned up) and swallowed so the job is not blindly re-executed from the beginning.
 * @param job - The batch job details.
 */
export async function execBatchJob(job: Job<ReentrantBatchJobData>): Promise<void> {
  const { authState } = job.data;
  const logger = getBatchLogger(job.data.asyncJobId, job.id);
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be available in job.data.authState in the future
  const store = new BatchCheckpointStore(job.data.asyncJobId, logger);
  let asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', job.data.asyncJobId);
  let chunkSeq = job.data.chunkSeq ?? 0;

  if (!isJobActive(asyncJob)) {
    await finalizeInterrupted(job, systemRepo, store, asyncJob, chunkSeq, authState);
    return;
  }

  const exec = new AsyncJobExecutor(systemRepo, asyncJob);
  let userConfig: UserConfiguration | undefined;
  let userRepo: Repository | undefined;
  let initialState: BatchInitialState | undefined;

  try {
    userConfig = await getUserConfiguration(systemRepo, authState.project, authState.membership);
    userRepo = await getBatchUserRepo(authState, userConfig);

    const router = new FhirRouter();
    const req: FhirRequest = {
      method: 'POST',
      url: '/',
      pathname: '',
      params: Object.create(null),
      query: Object.create(null),
      body: undefined,
    };

    let processor: BatchProcessor;
    let position: number;
    if (job.data.position === undefined) {
      // First run: load the raw bundle, preprocess it, and persist the initial state.
      const bundle = await store.loadInputBundle();
      processor = new BatchProcessor(router, userRepo, bundle, req);
      initialState = await processor.preprocess();
      await store.saveInitialState(initialState);
      position = 0;
      chunkSeq = 0;
      await job.updateData({ ...job.data, position, chunkSeq });
    } else {
      // Resume: rehydrate the processor from durably-persisted state.
      initialState = await store.loadInitialState();
      position = job.data.position;
      processor = BatchProcessor.fromState(router, userRepo, req, initialState, position);
      logger.info('resuming from checkpoint', { position, chunkSeq });
    }

    const checkpointEntries = job.data.checkpointEntries ?? defaultCheckpointEntries;
    const checkpointIntervalMs = job.data.checkpointIntervalMs ?? defaultCheckpointIntervalMs;
    let sinceCheckpoint = 0;
    let lastCheckpointTime = Date.now();

    // Flush results produced since the last checkpoint to durable storage, THEN advance the durable
    // progress marker. This ordering guarantees the marker never moves past an unpersisted result.
    const checkpoint = async (): Promise<void> => {
      const pending = processor.takePendingResults();
      if (pending) {
        await store.saveResultChunk(chunkSeq, pending);
        chunkSeq++;
      }
      await job.updateData({ ...job.data, position: processor.getPosition(), chunkSeq });
      logger.info('checkpoint', { position: processor.getPosition(), chunkSeq });
      sinceCheckpoint = 0;
      lastCheckpointTime = Date.now();
    };

    while (processor.hasMoreEntries()) {
      // Graceful shutdown: checkpoint and re-queue so a future worker resumes where we left off.
      if (queueRegistry.isClosing(job.queueName)) {
        logger.info('delaying since queue is closing', { position: processor.getPosition() });
        await checkpoint();
        await moveToDelayedAndThrow(job, 'Async batch delayed since queue is closing');
      }

      await processor.processNextEntry();
      sinceCheckpoint++;

      if (sinceCheckpoint >= checkpointEntries || Date.now() - lastCheckpointTime >= checkpointIntervalMs) {
        await checkpoint();

        asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
        if (!isJobActive(asyncJob)) {
          await finalizeInterrupted(job, systemRepo, store, asyncJob, chunkSeq, authState);
          return;
        }
      }
    }

    // Final checkpoint to flush any remaining results.
    await checkpoint();

    // Assemble the complete response bundle and upload it as a Binary for async retrieval.
    const { binary, bundle: resultBundle } = await assembleResultBundle(
      userRepo.clone(),
      store,
      initialState,
      chunkSeq
    );
    const errors = countBundleErrors(resultBundle);
    logger.info('completed processing batch', {
      results: getReferenceString(binary),
      entries: resultBundle.entry?.length,
      errors,
    });
    await exec.completeJob({
      resourceType: 'Parameters',
      parameter: [{ name: 'results', valueReference: createReference(binary) }],
    });
    await store.cleanup(chunkSeq);
  } catch (err) {
    // DelayedError means the job was intentionally re-queued; propagate for BullMQ to handle
    // Assume job data and state have been updated before the throw, so no cleanup is needed.
    if (err instanceof DelayedError) {
      throw err;
    }

    logger.error('unhandled exception', err instanceof Error ? err : { err });
    // Preserve a structured OperationOutcomeError (e.g. a bad bundle rejected during preprocessing)
    // rather than masking it as a generic server error.
    const failErr =
      err instanceof OperationOutcomeError
        ? err
        : new OperationOutcomeError(serverError(new Error(normalizeErrorString(err))));
    try {
      if (userRepo && initialState) {
        // attach whatever partial results were persisted and fail the job
        const { binary } = await assembleResultBundle(userRepo.clone(), store, initialState, chunkSeq);
        await exec
          .failJob(failErr, {
            resourceType: 'Parameters',
            parameter: [
              { name: 'results', valueReference: createReference(binary) },
              { name: 'error', valueString: normalizeErrorString(err) },
            ],
          })
          .catch((err) => {
            logger.error('Could not fail async job with partial results', err);
          });
      } else {
        await exec.failJob(failErr).catch((err) => {
          logger.error('Could not fail async job', err);
        });
      }
    } finally {
      await store.cleanup(chunkSeq);
    }
  }
}

/**
 * Handles a batch job that was interrupted out of band (e.g. cancelled). Assembles whatever partial
 * results were persisted and records them on the AsyncJob's output without changing its status,
 * then cleans up durable state. Best-effort: an interrupted job's status was set by another party,
 * so a conflicting update is ignored.
 * @param job - The BullMQ job instance.
 * @param systemRepo - The system repository.
 * @param store - The checkpoint store.
 * @param asyncJob - The (refreshed) AsyncJob, in a terminal/cancelled state.
 * @param chunkSeq - The number of result chunks written so far.
 * @param authState - The auth state captured when the batch was submitted.
 */
async function finalizeInterrupted(
  job: Job<ReentrantBatchJobData>,
  systemRepo: SystemRepository,
  store: BatchCheckpointStore,
  asyncJob: WithId<AsyncJob>,
  chunkSeq: number,
  authState: Readonly<AuthState>
): Promise<void> {
  try {
    getLogger().info('Async batch job cancelled mid-flight; making partial results available', {
      jobId: job.id,
      asyncJob: asyncJob.id,
      status: asyncJob.status,
    });
    const initialState = await store.loadInitialState();
    const userConfig = await getUserConfiguration(systemRepo, authState.project, authState.membership);
    const repo = await getBatchUserRepo(authState, userConfig);
    const { binary, bundle } = await assembleResultBundle(repo, store, initialState, chunkSeq);
    const output: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'partialResults', valueReference: createReference(binary) },
        { name: 'processedEntries', valueInteger: (bundle.entry ?? []).filter(Boolean).length },
      ],
    };
    // Best-effort: another party set this job's status, so a conflicting update is ignored.
    await updateAsyncJobOutput(systemRepo, asyncJob, output).catch(() => {});
  } catch (err) {
    getLogger().warn('Could not assemble partial results for interrupted async batch', {
      asyncJob: asyncJob.id,
      error: normalizeErrorString(err),
    });
  } finally {
    await store.cleanup(chunkSeq);
  }
}

/**
 * Assembles the response bundle from durably-persisted result entries and uploads it as a Binary
 * for async retrieval. Used for the final (complete) result as well as partial results when a job
 * is cancelled or fails; in the partial case, entries not yet processed are absent from the bundle.
 * @param repo - The user's repository (used to create the Binary).
 * @param store - The checkpoint store.
 * @param initialState - The preprocessed initial state.
 * @param chunkSeq - The number of result chunks written so far.
 * @returns The uploaded Binary and the assembled response bundle.
 */
async function assembleResultBundle(
  repo: Repository,
  store: BatchCheckpointStore,
  initialState: BatchInitialState,
  chunkSeq: number
): Promise<{ binary: Binary; bundle: Bundle }> {
  const results = await store.loadAllResults(chunkSeq);
  // Include error results produced during preprocessing (they are not part of any result chunk).
  Object.assign(results, initialState.preprocessResults);
  const entryCount = initialState.bundle.entry?.length ?? 0;
  const bundle = buildBatchResponseBundle(initialState.bundle.type, entryCount, results);
  const binary = await uploadBinaryData(repo, JSON.stringify(bundle), { contentType: ContentType.FHIR_JSON });
  return { binary, bundle };
}

function countBundleErrors(bundle: Bundle): number {
  let errors = 0;
  for (const entry of bundle.entry ?? []) {
    if (!entry?.response?.outcome || !isOk(entry.response.outcome)) {
      errors++;
    }
  }
  return errors;
}

/**
 * @deprecated Processes legacy jobs. Can be removed in v5.2+
 * @param job - The BullMQ job instance.
 */
export async function execLegacyBatchJob(job: Job<LegacyBatchJobData>): Promise<void> {
  const bundle = job.data.bundle;
  const { login, project, membership } = job.data.authState;
  const logger = getBatchLogger(job.data.asyncJob.id, job.id);
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be available in job.data.authState in the future

  // Prepare the original submitting user's repo
  const userConfig = await getUserConfiguration(systemRepo, project, membership);
  const repo = await getRepoForLogin({ login, project, membership, userConfig }, true);
  const router = new FhirRouter();
  const req: FhirRequest = {
    method: 'POST',
    url: '/',
    pathname: '',
    params: Object.create(null),
    query: Object.create(null),
    body: bundle,
  };

  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);

  // Intentionally swallow all errors thrown during or after execution of the batch request, since we do NOT want to
  // execute part or all of the batch more than once.
  // If this function does not throw an error, the job will be considered "successful" and not requeued
  try {
    const [outcome, result] = await router.handleRequest(req, repo);

    // Update the async job with system repo
    if (isOk(outcome)) {
      // Upload resulting Bundle JSON as Binary for async retrieval
      const binary = await uploadBinaryData(repo, JSON.stringify(result), { contentType: ContentType.FHIR_JSON });

      const bundle = result as Bundle;
      if (!bundle.entry) {
        return;
      }

      let errors = 0;
      for (const entry of bundle.entry) {
        if (!entry.response?.outcome || !isOk(entry.response.outcome)) {
          errors++;
        }
      }

      logger.info('Completed async batch request', {
        results: getReferenceString(binary),
        entries: bundle.entry.length,
        errors,
      });
      await exec.completeJob({
        resourceType: 'Parameters',
        parameter: [{ name: 'results', valueReference: createReference(binary) }],
      });
    } else {
      logger.warn('Async batch request failed', { outcome });
      await exec.failJob(new OperationOutcomeError(outcome));
    }
  } catch (err: any) {
    logger.error(`Async batch unhandled exception`, err);
    // Try to mark AsyncJob as failed, best effort
    await exec.failJob(new OperationOutcomeError(serverError(err))).catch(() => {});
  }
}

const BATCH_LOGGER_SUBSYSTEM = 'async-batch';

function getBatchLogger(asyncJobId: string, jobId?: string): ILogger {
  const baseLogger = getLogger();
  const metadata: Record<string, string> = {
    subsystem: BATCH_LOGGER_SUBSYSTEM,
    asyncJob: 'AsyncJob/' + asyncJobId,
  };
  if (jobId) {
    metadata.jobId = jobId;
  }
  return baseLogger.clone({ metadata });
}
