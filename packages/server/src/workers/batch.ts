// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
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
import type { AsyncJob, Binary, Bundle, Parameters } from '@medplum/fhirtypes';
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

export interface BatchJobData {
  readonly asyncJob: WithId<AsyncJob>;
  readonly authState: Readonly<AuthState>;
  readonly requestId?: string;
  readonly traceId?: string;
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

const queueName = 'BatchQueue';
const jobName = 'BatchJobData';

const defaultCheckpointEntries = 50;
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
        return runInAuthenticatedContext(authState, requestId, traceId, { async: true }, () => execBatchJob(job));
      },
      {
        ...defaultOptions,
        concurrency: 1,
        ...workerBullmq,
      }
    );

    worker.on('failed', async (job, err) => {
      if (!job) {
        return;
      }

      // A delayed/re-queued job is not a failure; nothing to do.
      if (err instanceof DelayedError) {
        return;
      }

      // This fires only when the job could not be recovered by re-entrant resume (e.g. it stalled
      // more than maxStalledCount times). Mark the AsyncJob failed if it is still in progress and
      // clean up any durable checkpoint state.
      const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be available in job.data.authState in the future
      const store = new BatchCheckpointStore(job.data.asyncJob.id);
      try {
        const asyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', job.data.asyncJob.id);
        if (isJobActive(asyncJob)) {
          await new AsyncJobExecutor(systemRepo, asyncJob).failJob(err ?? undefined);
        }
      } catch (readErr) {
        // Fall back to failing with the stale snapshot if the job could not be re-read.
        await new AsyncJobExecutor(systemRepo, job.data.asyncJob).failJob(err ?? undefined).catch(() => {});
        getLogger().error('Async batch failed handler could not refresh AsyncJob', {
          asyncJob: job.data.asyncJob.id,
          error: normalizeErrorString(readErr),
        });
      }
      await store.cleanup(job.data.chunkSeq ?? 0);
    });
    addVerboseQueueLogging<BatchJobData>(queue, worker, (job) => ({
      asyncJob: getReferenceString(job.data.asyncJob),
      project: getReferenceString(job.data.authState.project),
      profile: job.data.authState.profile && getReferenceString(job.data.authState.profile),
      membership: getReferenceString(job.data.authState.membership),
      onBehalfOf: job.data.authState.onBehalfOf && getReferenceString(job.data.authState.onBehalfOf),
      onBehalfOfMembership:
        job.data.authState.onBehalfOfMembership && getReferenceString(job.data.authState.onBehalfOfMembership),
    }));
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
 * @param job - The batch job details.
 * @returns The enqueued job.
 */
async function addBatchJobData(job: BatchJobData): Promise<Job<BatchJobData>> {
  const queue = queueRegistry.get<BatchJobData>(queueName);
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add(jobName, job);
}

export async function queueBatchProcessing(bundle: Bundle, asyncJob: WithId<AsyncJob>): Promise<Job<BatchJobData>> {
  const { authentication: authState, requestId, traceId } = getAuthenticatedContext();
  // Persist the (potentially large) input bundle to durable object storage rather than carrying it
  // in the BullMQ job data (see https://github.com/medplum/medplum/issues/9124). The worker loads
  // it on the first run to preprocess.
  await new BatchCheckpointStore(asyncJob.id).saveInputBundle(bundle);
  return addBatchJobData({ asyncJob, authState, requestId, traceId });
}

/**
 * Builds the submitting user's repository for processing batch entries.
 * @param systemRepo - The system repository.
 * @param authState - The auth state captured when the batch was submitted.
 * @returns The user's repository.
 */
async function getBatchUserRepo(systemRepo: SystemRepository, authState: Readonly<AuthState>): Promise<Repository> {
  const { login, project, membership } = authState;
  const userConfig = await getUserConfiguration(systemRepo, project, membership);
  return getRepoForLogin({ login, project, membership, userConfig }, true);
}

function makeBatchRequest(): FhirRequest {
  return {
    method: 'POST',
    url: '/',
    pathname: '',
    params: Object.create(null),
    query: Object.create(null),
    body: undefined,
  };
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
export async function execBatchJob(job: Job<BatchJobData>): Promise<void> {
  const { asyncJob, authState } = job.data;
  const logger = getLogger();
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be available in job.data.authState in the future
  const store = new BatchCheckpointStore(asyncJob.id);
  const exec = new AsyncJobExecutor(systemRepo, asyncJob);

  let chunkSeq = job.data.chunkSeq ?? 0;
  let initialState: BatchInitialState | undefined;

  try {
    // Detect out-of-band cancellation (or an already-finished job) before doing any work.
    let current = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
    if (!isJobActive(current)) {
      logger.info('Async batch job is no longer active; making partial results available', {
        jobId: job.id,
        asyncJob: asyncJob.id,
        status: current.status,
      });
      await finalizeInterrupted(systemRepo, store, current, chunkSeq, authState);
      return;
    }

    const repo = await getBatchUserRepo(systemRepo, authState);
    const router = new FhirRouter();
    const req = makeBatchRequest();

    let processor: BatchProcessor;
    let position = job.data.position;

    if (position === undefined) {
      // First run: load the raw bundle, preprocess it, and persist the initial state.
      const bundle = await store.loadInputBundle();
      processor = new BatchProcessor(router, repo, bundle, req);
      initialState = await processor.preprocess();
      await store.saveInitialState(initialState);
      position = 0;
      chunkSeq = 0;
      await job.updateData({ ...job.data, position, chunkSeq });
    } else {
      // Resume: rehydrate the processor from durably-persisted state.
      initialState = await store.loadInitialState();
      processor = BatchProcessor.fromState(router, repo, req, initialState, position);
    }

    const checkpointEntries = job.data.checkpointEntries ?? defaultCheckpointEntries;
    const checkpointIntervalMs = job.data.checkpointIntervalMs ?? defaultCheckpointIntervalMs;
    let sinceCheckpoint = 0;
    let lastCheckpointTime = Date.now();

    // Flush results produced since the last checkpoint to durable storage, THEN advance the durable
    // progress marker. This ordering guarantees the marker never moves past an unpersisted result.
    const checkpoint = async (): Promise<void> => {
      const pending = processor.takePendingResults();
      if (Object.keys(pending).length > 0) {
        await store.saveResultChunk(chunkSeq, pending);
        chunkSeq++;
      }
      await job.updateData({ ...job.data, position: processor.getPosition(), chunkSeq });
      sinceCheckpoint = 0;
      lastCheckpointTime = Date.now();
    };

    while (processor.hasMoreEntries()) {
      // Graceful shutdown: checkpoint and re-queue so a future worker resumes where we left off.
      if (queueRegistry.isClosing(job.queueName)) {
        logger.info('Async batch job detected queue is closing; delaying', {
          jobId: job.id,
          asyncJob: asyncJob.id,
          position: processor.getPosition(),
        });
        await checkpoint();
        await moveToDelayedAndThrow(job, 'Async batch delayed since queue is closing');
      }

      await processor.processNextEntry();
      sinceCheckpoint++;

      if (sinceCheckpoint >= checkpointEntries || Date.now() - lastCheckpointTime >= checkpointIntervalMs) {
        await checkpoint();

        // Detect out-of-band cancellation between checkpoints and make partial results available.
        current = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
        if (!isJobActive(current)) {
          logger.info('Async batch job cancelled mid-flight; making partial results available', {
            jobId: job.id,
            asyncJob: asyncJob.id,
            status: current.status,
          });
          await finalizeInterrupted(systemRepo, store, current, chunkSeq, authState);
          return;
        }
      }
    }

    // Final checkpoint to flush any remaining results.
    await checkpoint();

    // Assemble the complete response bundle and upload it as a Binary for async retrieval.
    const { binary, bundle } = await assembleResultBundle(repo, store, initialState, chunkSeq);
    const errors = countBundleErrors(bundle);
    logger.info('Completed async batch request', {
      jobId: job.id,
      asyncJob: asyncJob.id,
      results: getReferenceString(binary),
      entries: bundle.entry?.length,
      errors,
    });
    await exec.completeJob({
      resourceType: 'Parameters',
      parameter: [{ name: 'results', valueReference: createReference(binary) }],
    });
    await store.cleanup(chunkSeq);
  } catch (err: any) {
    // A DelayedError means the job was intentionally re-queued; propagate it for BullMQ to handle
    // and leave durable state in place so the resumed job can continue.
    if (err instanceof DelayedError) {
      throw err;
    }

    logger.error('Async batch unhandled exception', err);
    // Preserve a structured OperationOutcomeError (e.g. a bad bundle rejected during preprocessing)
    // rather than masking it as a generic server error.
    const failErr = err instanceof OperationOutcomeError ? err : new OperationOutcomeError(serverError(err));
    // Best-effort: attach whatever partial results were persisted, then fail the job and clean up.
    try {
      if (initialState) {
        const repo = await getBatchUserRepo(systemRepo, authState);
        const { binary } = await assembleResultBundle(repo, store, initialState, chunkSeq);
        await exec
          .failJob(failErr, {
            resourceType: 'Parameters',
            parameter: [
              { name: 'results', valueReference: createReference(binary) },
              { name: 'error', valueString: normalizeErrorString(err) },
            ],
          })
          .catch(() => {});
      } else {
        await exec.failJob(failErr).catch(() => {});
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
 * @param systemRepo - The system repository.
 * @param store - The checkpoint store.
 * @param asyncJob - The (refreshed) AsyncJob, in a terminal/cancelled state.
 * @param chunkSeq - The number of result chunks written so far.
 * @param authState - The auth state captured when the batch was submitted.
 */
async function finalizeInterrupted(
  systemRepo: SystemRepository,
  store: BatchCheckpointStore,
  asyncJob: WithId<AsyncJob>,
  chunkSeq: number,
  authState: Readonly<AuthState>
): Promise<void> {
  try {
    const initialState = await store.loadInitialState();
    const repo = await getBatchUserRepo(systemRepo, authState);
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
