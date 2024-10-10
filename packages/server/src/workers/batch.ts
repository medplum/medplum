import { AsyncJob, Bundle, Login, Project, ProjectMembership } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { getAuthenticatedContext, tryRunInRequestContext } from '../context';
import { globalLogger } from '../logger';
import { FhirRequest, FhirRouter } from '@medplum/fhir-router';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { ContentType, createReference, isOk, OperationOutcomeError } from '@medplum/core';
import { getSystemRepo } from '../fhir/repo';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { uploadBinaryData } from '../fhir/binary';

/*
 * The batch worker runs a batch asynchronously,
 * decoupled from an individual HTTP request.
 */

export interface BatchJobData {
  readonly asyncJob: AsyncJob;
  readonly bundle: Bundle;
  readonly login: Login;
  readonly project: Project;
  readonly membership: ProjectMembership;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'BatchQueue';
const jobName = 'BatchJobData';
let queue: Queue<BatchJobData> | undefined = undefined;
let worker: Worker<BatchJobData> | undefined = undefined;

/**
 * Initializes the batch worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 * @param config - The Medplum server config to use.
 */
export function initBatchWorker(config: MedplumServerConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<BatchJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 1,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<BatchJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execBatchJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the batch worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
export async function closeBatchWorker(): Promise<void> {
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
 * Returns the batch queue instance.
 * This is used by the unit tests.
 * @returns The batch queue (if available).
 */
export function getBatchQueue(): Queue<BatchJobData> | undefined {
  return queue;
}

/**
 * Adds a batch job to the queue.
 * @param job - The batch job details.
 * @returns The enqueued job.
 */
async function addBatchJobData(job: BatchJobData): Promise<Job<BatchJobData>> {
  if (!queue) {
    throw new Error('Job queue not available');
  }
  return queue.add(jobName, job);
}

export async function queueBatchProcessing(batch: Bundle, asyncJob: AsyncJob): Promise<Job<BatchJobData>> {
  const { requestId, traceId, login, project, membership } = getAuthenticatedContext();
  return addBatchJobData({
    bundle: batch,
    asyncJob,
    login,
    project,
    membership,
    requestId,
    traceId,
  });
}

/**
 * Executes a batch job.
 * @param job - The batch job details.
 */
export async function execBatchJob(job: Job<BatchJobData>): Promise<void> {
  const { bundle, login, project, membership } = job.data;

  // Process batch with the user's repo
  const repo = await getRepoForLogin({ login, project, membership });
  const router = new FhirRouter();
  const req: FhirRequest = {
    method: 'POST',
    url: '/',
    pathname: '',
    params: Object.create(null),
    query: Object.create(null),
    body: bundle,
  };
  const [outcome, result] = await router.handleRequest(req, repo);

  // Upload resulting Bundle JSON as Binary for async retrieval
  const binary = await uploadBinaryData(repo, JSON.stringify(result), { contentType: ContentType.FHIR_JSON });

  // Update the async job with system repo
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  if (isOk(outcome)) {
    await exec.completeJob(systemRepo, {
      resourceType: 'Parameters',
      parameter: [{ name: 'results', valueReference: createReference(binary) }],
    });
  } else {
    await exec.failJob(systemRepo, new OperationOutcomeError(outcome));
  }
}
