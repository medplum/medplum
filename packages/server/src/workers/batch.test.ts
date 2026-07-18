// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { AsyncJob, Binary, Bundle } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { DelayedError, Worker } from 'bullmq';
import type { Mock } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { getUserConfiguration } from '../auth/me';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { runInAuthenticatedContext } from '../context';
import { BatchCheckpointStore } from '../fhir/batch/checkpoint-store';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import type { Repository, SystemRepository } from '../fhir/repo';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { globalLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import { getBinaryStorage } from '../storage/loader';
import { createTestProject, streamToString, withTestContext } from '../test.setup';
import type { LegacyBatchJobData, ReentrantBatchJobData } from './batch';
import {
  execBatchJob,
  execLegacyBatchJob,
  getBatchQueue,
  initBatchWorker,
  queueBatchProcessing,
  queueLegacyBatchProcessing,
} from './batch';
import * as fairqueue from './fairqueue';
import * as workerUtils from './utils';
import { queueRegistry } from './utils';

/**
 * Builds a minimal mock BullMQ Job for a re-entrant batch, with a functional in-memory
 * `updateData` so checkpoints persist the progress marker (enabling resume tests) and
 * `moveToDelayed`/`token`/`queueName` so the graceful-shutdown path can be exercised.
 * @param data - The re-entrant job data.
 * @param overrides - Optional overrides applied on top of the defaults.
 * @returns A mock Job usable with execBatchJob.
 */
function makeReentrantJob(
  data: ReentrantBatchJobData,
  overrides?: Record<string, unknown>
): Job<ReentrantBatchJobData> {
  const job: any = {
    id: 'test-job',
    name: 'BatchJobData',
    data,
    queueName: 'BatchQueue',
    token: 'test-token',
    async updateData(newData: ReentrantBatchJobData) {
      job.data = newData;
    },
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return job as Job<ReentrantBatchJobData>;
}

function makeLegacyJob(data: LegacyBatchJobData): Job<LegacyBatchJobData> {
  return {
    id: 'legacy-job',
    name: 'BatchJobData',
    data,
    queueName: 'BatchQueue',
  } as unknown as Job<LegacyBatchJobData>;
}

const singleEntryBundle = (): Bundle => ({
  resourceType: 'Bundle',
  type: 'batch',
  entry: [{ request: { method: 'POST', url: 'Patient' }, resource: { resourceType: 'Patient' } }],
});

const multiEntryBundle = (count: number): Bundle => ({
  resourceType: 'Bundle',
  type: 'batch',
  entry: Array.from({ length: count }, () => ({
    request: { method: 'POST', url: 'Patient' },
    resource: { resourceType: 'Patient' },
  })),
});

describe('Batch worker', () => {
  let config: MedplumServerConfig;
  let repo: Repository;
  let systemRepo: SystemRepository;
  let authState: AuthState;

  beforeAll(async () => {
    config = await loadTestConfig();
    // Async batches throttle by sleeping `points * asyncDelayScaling` ms per DB op in the async
    // authenticated context (see Repository.recordFhirQuota). These tests exercise behavior, not
    // throttle timing, so zero the delay to keep the worker-processor tests fast.
    config.asyncDelayScaling = 0;
    await initAppServices(config);

    const project = await createTestProject({ withClient: true, withAccessToken: true, withRepo: true });
    repo = project.repo;
    systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);
    const userConfig = await getUserConfiguration(systemRepo, project.project, project.membership);
    authState = { login: project.login, project: project.project, membership: project.membership, userConfig };
  });

  beforeEach(() => {
    // Silence noisy worker logs; individual tests re-spy on the logger as needed.
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    // restoreAllMocks (not clearAllMocks) so a spy that changed implementation is always reverted,
    // even if the test failed before its inline mockRestore. Only affects vi.spyOn spies; the
    // module-level bullmq vi.fn() mocks (Queue.add, etc.) are left intact.
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function createAsyncJob(status: AsyncJob['status'] = 'accepted'): Promise<WithId<AsyncJob>> {
    return repo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status,
      request: 'https://example.com/fhir/R4',
      requestTime: new Date().toISOString(),
    });
  }

  // Sets up durable state for a re-entrant batch: creates the AsyncJob and stores the input bundle.
  async function setupReentrantJob(
    bundle: Bundle,
    extra?: Partial<ReentrantBatchJobData>,
    status: AsyncJob['status'] = 'accepted'
  ): Promise<{ asyncJob: WithId<AsyncJob>; job: Job<ReentrantBatchJobData> }> {
    const asyncJob = await createAsyncJob(status);
    await new BatchCheckpointStore(asyncJob.id, globalLogger).saveInputBundle(bundle);
    const job = makeReentrantJob({ asyncJobId: asyncJob.id, authState, ...extra });
    return { asyncJob, job };
  }

  async function readAsyncJob(id: string): Promise<WithId<AsyncJob>> {
    return systemRepo.readResource<AsyncJob>('AsyncJob', id);
  }

  // Reads the Bundle referenced by a `results`/`partialResults` output parameter.
  async function readResultsBundle(asyncJob: AsyncJob): Promise<Bundle> {
    const ref = asyncJob.output?.parameter?.find((p) => p.name === 'results' || p.name === 'partialResults')
      ?.valueReference?.reference;
    if (!ref) {
      throw new Error('No results reference on AsyncJob output');
    }
    const binary = await systemRepo.readReference<Binary>({ reference: ref });
    return JSON.parse(await streamToString(await getBinaryStorage().readBinary(binary))) as Bundle;
  }

  describe('execBatchJob (re-entrant)', () => {
    test('Processes a batch to completion', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob(multiEntryBundle(3));

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('completed');
        expect(finished.output?.parameter?.[0]).toMatchObject({
          name: 'results',
          valueReference: { reference: expect.stringMatching(/^Binary\//) },
        });

        const results = await readResultsBundle(finished);
        expect(results.type).toStrictEqual('batch-response');
        expect(results.entry).toHaveLength(3);
        expect(results.entry?.map((e) => e.response?.status)).toStrictEqual(['201', '201', '201']);
      }));

    test('Counts per-entry errors on completion', () =>
      withTestContext(async () => {
        // One successful create and one failing read, so the completion path's error tally runs.
        const bundle: Bundle = {
          resourceType: 'Bundle',
          type: 'batch',
          entry: [
            { request: { method: 'POST', url: 'Patient' }, resource: { resourceType: 'Patient' } },
            { request: { method: 'GET', url: 'Patient/00000000-0000-4000-8000-000000000000' } },
          ],
        };
        const { asyncJob, job } = await setupReentrantJob(bundle);

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('completed');
        const results = await readResultsBundle(finished);
        expect(results.entry?.map((e) => e.response?.status)).toStrictEqual(['201', '404']);
      }));

    test('Assembles completion results from memory without re-reading chunks written this run', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob(multiEntryBundle(3), { checkpointEntries: 1 });
        const loadSpy = vi.spyOn(BatchCheckpointStore.prototype, 'loadAllResults');
        const cleanupSpy = vi.spyOn(BatchCheckpointStore.prototype, 'cleanup');

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        // Three chunks were written this run, but assembly reads back none of them (only chunks
        // from previous runs of the job, of which there are none); cleanup still deletes all three.
        expect(loadSpy).toHaveBeenCalledWith(0);
        expect(cleanupSpy).toHaveBeenCalledWith(3);
        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('completed');
        const results = await readResultsBundle(finished);
        expect(results.entry?.map((e) => e.response?.status)).toStrictEqual(['201', '201', '201']);
      }));

    test('Fails on invalid bundle rejected during preprocessing, preserving the outcome', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob({
          resourceType: 'Bundle',
          type: 'pergola' as Bundle['type'],
        });

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('error');
        expect(finished.output?.parameter).toStrictEqual([
          expect.objectContaining({
            name: 'outcome',
            resource: expect.objectContaining({
              issue: [
                expect.objectContaining({ code: 'invalid', details: { text: expect.stringContaining('pergola') } }),
              ],
            }),
          }),
        ]);
      }));

    test('Fails with partial results when a checkpoint write fails after preprocessing', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob(multiEntryBundle(2), { checkpointEntries: 1 });

        vi.spyOn(BatchCheckpointStore.prototype, 'saveResultChunk').mockRejectedValue(
          new Error('object storage unavailable')
        );
        const cleanupSpy = vi.spyOn(BatchCheckpointStore.prototype, 'cleanup');

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('error');
        // Partial results and the error are attached to the output (plus the failJob outcome).
        expect(finished.output?.parameter?.map((p) => p.name)).toEqual(expect.arrayContaining(['results', 'error']));
        expect(cleanupSpy).toHaveBeenCalled();
      }));

    test('Delays and re-queues when the queue is closing, then resumes to completion', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob(multiEntryBundle(2));

        // Allow the first entry to process, then report the queue as closing.
        let checks = 0;
        const isClosingSpy = vi.spyOn(queueRegistry, 'isClosing').mockImplementation(() => checks++ >= 1);

        await expect(execBatchJob(job)).rejects.toBeInstanceOf(DelayedError);
        expect((job as any).moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'test-token');
        // Progress was checkpointed into the job data.
        expect(job.data.position).toStrictEqual(1);
        expect(job.data.chunkSeq).toStrictEqual(1);
        // The AsyncJob is still in progress, not failed.
        expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('accepted');

        isClosingSpy.mockRestore();

        // Resume on a fresh worker: rehydrate from durable state and finish. Assembly reads back
        // only the chunk persisted by the first run; this run's results are merged from memory.
        const loadSpy = vi.spyOn(BatchCheckpointStore.prototype, 'loadAllResults');
        const resumeJob = makeReentrantJob(job.data);
        await expect(execBatchJob(resumeJob)).resolves.toBeUndefined();
        expect(loadSpy).toHaveBeenCalledWith(1);

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('completed');
        const results = await readResultsBundle(finished);
        expect(results.entry).toHaveLength(2);
        expect(results.entry?.map((e) => e.response?.status)).toStrictEqual(['201', '201']);
      }));

    test('Publishes partial results when the AsyncJob was cancelled out of band', () =>
      withTestContext(async () => {
        const bundle = multiEntryBundle(3);
        const asyncJob = await createAsyncJob();
        const store = new BatchCheckpointStore(asyncJob.id, globalLogger);
        await store.saveInputBundle(bundle);

        // Pre-populate durable state: preprocessed initial state plus one processed entry.
        const { BatchProcessor, FhirRouter } = await import('@medplum/fhir-router');
        const processor = new BatchProcessor(new FhirRouter(), repo, bundle, {
          method: 'POST',
          url: '/',
          pathname: '',
          params: {},
          query: {},
          body: undefined,
        });
        const initialState = await processor.preprocess();
        await store.saveInitialState(initialState);
        await processor.processNextEntry();
        const pending = processor.takePendingResults();
        assert(pending);
        await store.saveResultChunk(0, pending);

        // Cancel the job, then run: it should not process further, only publish partial results.
        await repo.patchResource('AsyncJob', asyncJob.id, [{ op: 'add', path: '/status', value: 'cancelled' }]);
        const job = makeReentrantJob({ asyncJobId: asyncJob.id, authState, position: 1, chunkSeq: 1 });
        const cleanupSpy = vi.spyOn(BatchCheckpointStore.prototype, 'cleanup');

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('cancelled');
        expect(finished.output?.parameter).toStrictEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'partialResults' }),
            expect.objectContaining({ name: 'processedEntries', valueInteger: 1 }),
          ])
        );
        const results = await readResultsBundle(finished);
        expect(results.entry?.filter(Boolean)).toHaveLength(1);
        expect(cleanupSpy).toHaveBeenCalled();
        cleanupSpy.mockRestore();
      }));

    test('Detects cancellation between checkpoints and publishes partial results', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob(multiEntryBundle(2), { checkpointEntries: 1 });

        // Cancel the AsyncJob as a side effect of the first checkpoint write, so the subsequent
        // in-loop status re-read observes the cancellation and finalizes mid-flight.
        const store = new BatchCheckpointStore(asyncJob.id, globalLogger);
        const realSaveResultChunk = store.saveResultChunk.bind(store);
        let saves = 0;
        vi.spyOn(BatchCheckpointStore.prototype, 'saveResultChunk').mockImplementation(async (seq, results) => {
          await realSaveResultChunk(seq, results);
          if (++saves === 1) {
            await repo.patchResource('AsyncJob', asyncJob.id, [{ op: 'add', path: '/status', value: 'cancelled' }]);
          }
        });

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('cancelled');
        expect(finished.output?.parameter).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'partialResults' }),
            expect.objectContaining({ name: 'processedEntries', valueInteger: 1 }),
          ])
        );
      }));

    test('Swallows a failJob error thrown after preprocessing (partial-results branch)', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob(multiEntryBundle(2), { checkpointEntries: 1 });
        vi.spyOn(BatchCheckpointStore.prototype, 'saveResultChunk').mockRejectedValue(new Error('storage down'));
        vi.spyOn(AsyncJobExecutor.prototype, 'failJob').mockRejectedValue(new Error('db down'));

        // The failJob rejection is caught and logged; execBatchJob still resolves.
        await expect(execBatchJob(job)).resolves.toBeUndefined();
        expect(AsyncJobExecutor.prototype.failJob).toHaveBeenCalled();
        expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('accepted');
      }));

    test('Swallows a failJob error when preprocessing fails (no partial results)', () =>
      withTestContext(async () => {
        const { job } = await setupReentrantJob({ resourceType: 'Bundle', type: 'pergola' as Bundle['type'] });
        vi.spyOn(AsyncJobExecutor.prototype, 'failJob').mockRejectedValue(new Error('db down'));

        await expect(execBatchJob(job)).resolves.toBeUndefined();
        expect(AsyncJobExecutor.prototype.failJob).toHaveBeenCalled();
      }));

    test('Cancelled with no durable state cleans up without publishing results', () =>
      withTestContext(async () => {
        const { asyncJob, job } = await setupReentrantJob(singleEntryBundle(), undefined, 'cancelled');
        const cleanupSpy = vi.spyOn(BatchCheckpointStore.prototype, 'cleanup');

        await expect(execBatchJob(job)).resolves.toBeUndefined();

        // finalizeInterrupted could not load initial state (none was persisted), so no results
        // are published, but durable state is still cleaned up and the status is untouched.
        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('cancelled');
        expect(finished.output).toBeUndefined();
        expect(cleanupSpy).toHaveBeenCalled();
      }));
  });

  describe('execLegacyBatchJob (deprecated)', () => {
    test('Processes a legacy batch to completion, counting per-entry errors', () =>
      withTestContext(async () => {
        const asyncJob = await createAsyncJob();
        // One successful create and one failing read, so the worker's error tally is exercised.
        const bundle: Bundle = {
          resourceType: 'Bundle',
          type: 'batch',
          entry: [
            { request: { method: 'POST', url: 'Patient' }, resource: { resourceType: 'Patient' } },
            { request: { method: 'GET', url: 'Patient/00000000-0000-4000-8000-000000000000' } },
          ],
        };
        const job = makeLegacyJob({ asyncJob, bundle, authState });

        await expect(execLegacyBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('completed');
        const results = await readResultsBundle(finished);
        expect(results.entry).toHaveLength(2);
        expect(results.entry?.map((e) => e.response?.status)).toStrictEqual(['201', '404']);
      }));

    test('Returns early without attaching results when the response bundle has no entries', () =>
      withTestContext(async () => {
        const asyncJob = await createAsyncJob();
        const job = makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState });

        // An ok outcome whose response bundle carries no `entry` makes the worker return early,
        // before uploading a Binary or completing the job.
        const { allOk } = await import('@medplum/core');
        const { FhirRouter } = await import('@medplum/fhir-router');
        vi.spyOn(FhirRouter.prototype, 'handleRequest').mockResolvedValue([
          allOk,
          { resourceType: 'Bundle', type: 'batch-response' },
        ]);

        await expect(execLegacyBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        // completeJob is never reached on the empty-bundle early return, so the status is unchanged.
        expect(finished.status).toStrictEqual('accepted');
        expect(finished.output).toBeUndefined();
      }));

    test('Fails the job when the batch request returns a non-ok outcome', () =>
      withTestContext(async () => {
        const asyncJob = await createAsyncJob();
        const job = makeLegacyJob({
          asyncJob,
          bundle: { resourceType: 'Bundle', type: 'pergola' as Bundle['type'] },
          authState,
        });

        await expect(execLegacyBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('error');
        expect(finished.output?.parameter?.[0]).toMatchObject({ name: 'outcome' });
      }));

    test('Fails the job when an unexpected error is thrown', () =>
      withTestContext(async () => {
        const asyncJob = await createAsyncJob();
        const job = makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState });

        const writeSpy = vi.spyOn(getBinaryStorage(), 'writeBinary').mockRejectedValue(new Error('storage exploded'));

        await expect(execLegacyBatchJob(job)).resolves.toBeUndefined();

        const finished = await readAsyncJob(asyncJob.id);
        expect(finished.status).toStrictEqual('error');
        writeSpy.mockRestore();
      }));

    test('Swallows a failJob error thrown after an unexpected processing error', () =>
      withTestContext(async () => {
        const asyncJob = await createAsyncJob();
        const job = makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState });

        vi.spyOn(getBinaryStorage(), 'writeBinary').mockRejectedValue(new Error('storage exploded'));
        vi.spyOn(AsyncJobExecutor.prototype, 'failJob').mockRejectedValue(new Error('db down'));

        // Both the processing error and the failJob rejection are caught; execLegacyBatchJob resolves.
        await expect(execLegacyBatchJob(job)).resolves.toBeUndefined();
        expect(AsyncJobExecutor.prototype.failJob).toHaveBeenCalled();
        expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('accepted');
      }));
  });

  describe('queueBatchProcessing', () => {
    test('Stores the input bundle out-of-band and enqueues re-entrant job data', async () => {
      const queue = getBatchQueue() as any;
      queue.add.mockClear();
      const bundle = singleEntryBundle();

      await withTestContext(async () => {
        const asyncJob = await createAsyncJob();

        await runInAuthenticatedContext(authState, undefined, undefined, undefined, () =>
          queueBatchProcessing(bundle, asyncJob)
        );

        // Enqueued data carries asyncJobId and authState, but NOT the bundle (#9124).
        expect(queue.add).toHaveBeenCalledWith(
          'BatchJobData',
          expect.objectContaining<Partial<ReentrantBatchJobData>>({ asyncJobId: asyncJob.id, authState })
        );
        const enqueued = queue.add.mock.calls[0][1] as ReentrantBatchJobData & { bundle?: unknown };
        expect(enqueued.bundle).toBeUndefined();

        // The bundle was persisted to durable storage.
        const stored = await new BatchCheckpointStore(asyncJob.id, globalLogger).loadInputBundle();
        expect(stored).toStrictEqual(bundle);
      });
    });

    test('Throws when the batch queue is not available', () =>
      withTestContext(async () => {
        const asyncJob = await createAsyncJob();
        vi.spyOn(queueRegistry, 'get').mockReturnValue(undefined);

        await expect(
          runInAuthenticatedContext(authState, undefined, undefined, undefined, () =>
            queueBatchProcessing(singleEntryBundle(), asyncJob)
          )
        ).rejects.toThrow('Job queue BatchQueue not available');
      }));

    test('Sets the BullMQ priority from the project in-flight count when fair queueing is enabled', () =>
      withTestContext(async () => {
        const queue = getBatchQueue() as any;
        queue.add.mockClear();
        // Control the derived priority so the assertion is deterministic.
        const prioritySpy = vi.spyOn(fairqueue, 'incrementProjectJobPriority').mockResolvedValue(4);
        const enabledAuthState: AuthState = {
          ...authState,
          project: {
            ...authState.project,
            systemSetting: [{ name: 'asyncBatchFairQueueEnabled', valueBoolean: true }],
          },
        };
        const asyncJob = await createAsyncJob();

        await runInAuthenticatedContext(enabledAuthState, undefined, undefined, undefined, () =>
          queueBatchProcessing(singleEntryBundle(), asyncJob)
        );

        expect(prioritySpy).toHaveBeenCalledWith(expect.anything(), 'BatchQueue', authState.project.id);
        expect(queue.add).toHaveBeenCalledWith('BatchJobData', expect.anything(), { priority: 4 });
      }));

    test('Does not set a priority or touch the counter when fair queueing is disabled', () =>
      withTestContext(async () => {
        const queue = getBatchQueue() as any;
        queue.add.mockClear();
        const prioritySpy = vi.spyOn(fairqueue, 'incrementProjectJobPriority');
        const disabledAuthState: AuthState = {
          ...authState,
          project: {
            ...authState.project,
            systemSetting: [{ name: 'asyncBatchFairQueueEnabled', valueBoolean: false }],
          },
        };
        const asyncJob = await createAsyncJob();

        await runInAuthenticatedContext(disabledAuthState, undefined, undefined, undefined, () =>
          queueBatchProcessing(singleEntryBundle(), asyncJob)
        );

        expect(prioritySpy).not.toHaveBeenCalled();
        // Enqueued with just the name and data — no options/priority argument.
        expect(queue.add).toHaveBeenCalledTimes(1);
        expect(queue.add).toHaveBeenCalledWith('BatchJobData', expect.anything());
      }));
  });

  describe('queueLegacyBatchProcessing', () => {
    test('Enqueues legacy job data carrying the bundle inline', () =>
      withTestContext(async () => {
        const queue = getBatchQueue() as any;
        queue.add.mockClear();
        const bundle = singleEntryBundle();
        const asyncJob = await createAsyncJob();

        await runInAuthenticatedContext(authState, undefined, undefined, undefined, () =>
          queueLegacyBatchProcessing(bundle, asyncJob)
        );

        // Unlike the re-entrant path, the legacy job carries the bundle and asyncJob inline.
        expect(queue.add).toHaveBeenCalledWith(
          'BatchJobData',
          expect.objectContaining<Partial<LegacyBatchJobData>>({ asyncJob, bundle, authState })
        );
      }));
  });

  describe('worker wiring', () => {
    // Captures the processor function and the `failed`/`completed` event handlers registered by
    // initBatchWorker.
    function captureWorker(): {
      processor: (job: Job) => Promise<void>;
      failedHandler: (job: Job | undefined, err: Error) => Promise<void>;
      completedHandler: (job: Job) => Promise<void>;
    } {
      const { worker } = initBatchWorker(config);
      const processor = vi.mocked(Worker).mock.calls.at(-1)?.[1] as (job: Job) => Promise<void>;
      const onCalls = (worker?.on as unknown as Mock).mock.calls as [string, (...args: any[]) => any][];
      const failedHandler = onCalls.find((c) => c[0] === 'failed')?.[1] as (
        job: Job | undefined,
        err: Error
      ) => Promise<void>;
      const completedHandler = onCalls.find((c) => c[0] === 'completed')?.[1] as (job: Job) => Promise<void>;
      return { processor, failedHandler, completedHandler };
    }

    test('Does not create a worker when workerEnabled is false', () => {
      const result = initBatchWorker(config, { workerEnabled: false });
      expect(result.worker).toBeUndefined();
      expect(result.queue).toBeDefined();
      expect(result.name).toStrictEqual('BatchQueue');
    });

    test('Dispatches re-entrant jobs to execBatchJob', () =>
      withTestContext(async () => {
        const { processor } = captureWorker();
        const { asyncJob, job } = await setupReentrantJob(singleEntryBundle());

        await expect(processor(job)).resolves.toBeUndefined();
        expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('completed');
      }));

    test('Dispatches legacy jobs to execLegacyBatchJob', () =>
      withTestContext(async () => {
        const { processor } = captureWorker();
        const asyncJob = await createAsyncJob();
        const job = makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState });

        await expect(processor(job)).resolves.toBeUndefined();
        expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('completed');
      }));

    test('Throws on unrecognized job data', () =>
      withTestContext(async () => {
        const { processor } = captureWorker();
        await expect(processor({ data: { authState } } as unknown as Job)).rejects.toThrow(TypeError);
      }));

    test('Verbose logging fields resolve the async job reference for both job shapes', () =>
      withTestContext(async () => {
        const spy = vi.spyOn(workerUtils, 'addVerboseQueueLogging');
        initBatchWorker(config);
        const logFields = spy.mock.calls.at(-1)?.[2] as (job: Job) => Record<string, unknown>;
        const asyncJob = await createAsyncJob();

        expect(logFields(makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState }))).toMatchObject({
          asyncJob: getReferenceString(asyncJob),
        });
        expect(logFields(makeReentrantJob({ asyncJobId: asyncJob.id, authState }))).toHaveProperty('asyncJob');
      }));

    test('Verbose logging fields resolve optional profile and on-behalf-of references when present', () =>
      withTestContext(async () => {
        const spy = vi.spyOn(workerUtils, 'addVerboseQueueLogging');
        initBatchWorker(config);
        const logFields = spy.mock.calls.at(-1)?.[2] as (job: Job) => Record<string, unknown>;

        const profile = { reference: 'Practitioner/p1' };
        const onBehalfOf = { resourceType: 'Practitioner', id: 'p2' };
        const onBehalfOfMembership = { resourceType: 'ProjectMembership', id: 'm2' };
        const richAuthState = {
          ...authState,
          profile,
          onBehalfOf,
          onBehalfOfMembership,
        } as unknown as AuthState;

        expect(logFields(makeReentrantJob({ asyncJobId: 'x', authState: richAuthState }))).toMatchObject({
          profile: getReferenceString(profile),
          onBehalfOf: getReferenceString(onBehalfOf),
          onBehalfOfMembership: getReferenceString(onBehalfOfMembership),
        });
      }));

    describe('failed handler', () => {
      test('No-op when there is no job', async () => {
        const { failedHandler } = captureWorker();
        await expect(failedHandler(undefined, new Error('x'))).resolves.toBeUndefined();
      });

      test('No-op for a DelayedError (job was re-queued, not failed)', () =>
        withTestContext(async () => {
          const { failedHandler } = captureWorker();
          const { asyncJob, job } = await setupReentrantJob(singleEntryBundle());
          await failedHandler(job, new DelayedError());
          expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('accepted');
        }));

      test('Fails the AsyncJob for a legacy job', () =>
        withTestContext(async () => {
          const { failedHandler } = captureWorker();
          const asyncJob = await createAsyncJob();
          await failedHandler(makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState }), new Error('boom'));
          expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('error');
        }));

      test('Fails the active AsyncJob and cleans up for a re-entrant job', () =>
        withTestContext(async () => {
          const { failedHandler } = captureWorker();
          const { asyncJob, job } = await setupReentrantJob(singleEntryBundle(), { chunkSeq: 0 });
          const cleanupSpy = vi.spyOn(BatchCheckpointStore.prototype, 'cleanup');

          await failedHandler(job, new Error('boom'));

          expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('error');
          expect(cleanupSpy).toHaveBeenCalledWith(0);
          cleanupSpy.mockRestore();
        }));

      test('Skips failing a re-entrant job that is no longer active but still cleans up', () =>
        withTestContext(async () => {
          const { failedHandler } = captureWorker();
          const { asyncJob, job } = await setupReentrantJob(singleEntryBundle(), undefined, 'cancelled');
          const cleanupSpy = vi.spyOn(BatchCheckpointStore.prototype, 'cleanup');

          await failedHandler(job, new Error('boom'));

          expect((await readAsyncJob(asyncJob.id)).status).toStrictEqual('cancelled');
          expect(cleanupSpy).toHaveBeenCalled();
          cleanupSpy.mockRestore();
        }));

      // Not wrapped in withTestContext so getLogger() falls back to the globalLogger we spy on.
      test('Logs and returns for unrecognized job data', async () => {
        const { failedHandler } = captureWorker();
        const errorSpy = vi.spyOn(globalLogger, 'error').mockImplementation(() => {});
        await failedHandler({ data: { authState } } as unknown as Job, new Error('boom'));
        expect(errorSpy).toHaveBeenCalledWith(
          'Unrecognized BatchJobData',
          expect.objectContaining({ jobData: { authState } })
        );
      });
    });

    describe('fair-queue slot release', () => {
      let enabledAuthState: AuthState;
      let disabledAuthState: AuthState;

      beforeAll(() => {
        enabledAuthState = {
          ...authState,
          project: {
            ...authState.project,
            systemSetting: [{ name: 'asyncBatchFairQueueEnabled', valueBoolean: true }],
          },
        };

        disabledAuthState = {
          ...authState,
          project: {
            ...authState.project,
            systemSetting: [{ name: 'asyncBatchFairQueueEnabled', valueBoolean: false }],
          },
        };
      });
      test('completed handler releases the slot', () =>
        withTestContext(async () => {
          const { completedHandler } = captureWorker();
          const decrSpy = vi.spyOn(fairqueue, 'decrementProjectJobCount').mockResolvedValue();
          await completedHandler(makeReentrantJob({ asyncJobId: 'x', authState: enabledAuthState }));
          expect(decrSpy).toHaveBeenCalledWith(expect.anything(), 'BatchQueue', authState.project.id);
        }));

      test('completed handler releases the slot for a legacy job', () =>
        withTestContext(async () => {
          const { completedHandler } = captureWorker();
          const decrSpy = vi.spyOn(fairqueue, 'decrementProjectJobCount').mockResolvedValue();
          const asyncJob = await createAsyncJob();
          // The legacy branch derives the logger from asyncJob.id rather than asyncJobId.
          await completedHandler(makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState: enabledAuthState }));
          expect(decrSpy).toHaveBeenCalledWith(expect.anything(), 'BatchQueue', authState.project.id);
        }));

      test('completed handler swallows a decrement failure', () =>
        withTestContext(async () => {
          const { completedHandler } = captureWorker();
          vi.spyOn(fairqueue, 'decrementProjectJobCount').mockRejectedValue(new Error('redis down'));
          // A failed slot release is logged and swallowed so it never disrupts BullMQ event handling.
          await expect(
            completedHandler(makeReentrantJob({ asyncJobId: 'x', authState: enabledAuthState }))
          ).resolves.toBeUndefined();
        }));

      test('failed handler releases the slot on terminal failure', () =>
        withTestContext(async () => {
          const { failedHandler } = captureWorker();
          const decrSpy = vi.spyOn(fairqueue, 'decrementProjectJobCount').mockResolvedValue();
          const asyncJob = await createAsyncJob();
          await failedHandler(
            makeLegacyJob({ asyncJob, bundle: singleEntryBundle(), authState: enabledAuthState }),
            new Error('boom')
          );
          expect(decrSpy).toHaveBeenCalledWith(expect.anything(), 'BatchQueue', authState.project.id);
        }));

      test('failed handler does NOT release the slot for a DelayedError (still in flight)', () =>
        withTestContext(async () => {
          const { failedHandler } = captureWorker();
          const decrSpy = vi.spyOn(fairqueue, 'decrementProjectJobCount').mockResolvedValue();
          await failedHandler(makeReentrantJob({ asyncJobId: 'x', authState: enabledAuthState }), new DelayedError());
          expect(decrSpy).not.toHaveBeenCalled();
        }));

      test('does not release the slot when fair queueing is disabled', () =>
        withTestContext(async () => {
          const { completedHandler } = captureWorker();
          const decrSpy = vi.spyOn(fairqueue, 'decrementProjectJobCount').mockResolvedValue();
          await completedHandler(makeReentrantJob({ asyncJobId: 'x', authState: disabledAuthState }));
          expect(decrSpy).not.toHaveBeenCalled();
        }));
    });
  });
});
