// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  getReferenceString,
  isOk,
  OperationOutcomeError,
  serverError,
  WithId,
} from '@medplum/core';
import { FhirRequest, FhirRouter } from '@medplum/fhir-router';
import { AsyncJob, Bundle, Login, Project, ProjectMembership } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { getUserConfiguration } from '../auth/me';
import { getAuthenticatedContext, tryRunInRequestContext } from '../context';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { uploadBinaryData } from '../fhir/binary';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import { getLogger } from '../logger';
import { queueRegistry, WorkerInitializer } from './utils';

/*
 * The batch worker runs a batch asynchronously,
 * decoupled from an individual HTTP request.
 */

export interface BatchJobData {
  readonly asyncJob: WithId<AsyncJob>;
  readonly bundle: Bundle;
  readonly login: Login;
  readonly project: WithId<Project>;
  readonly membership: WithId<ProjectMembership>;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'BatchQueue';
const jobName = 'BatchJobData';

export const initBatchWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  const queue = new Queue<BatchJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: { attempts: 1 },
  });

  const worker = new Worker<BatchJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execBatchJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );

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

export async function queueBatchProcessing(batch: Bundle, asyncJob: WithId<AsyncJob>): Promise<Job<BatchJobData>> {
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
  const logger = getLogger();

  // Prepare the original submitting user's repo
  const userConfig = await getUserConfiguration(getSystemRepo(), project, membership);
  const repo = await getRepoForLogin({ login, project, membership, userConfig });
  const router = new FhirRouter();
  const req: FhirRequest = {
    method: 'POST',
    url: '/',
    pathname: '',
    params: Object.create(null),
    query: Object.create(null),
    body: bundle,
  };

  const systemRepo = getSystemRepo();
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
        jobId: job.id,
        asyncJob: job.data.asyncJob.id,
        results: getReferenceString(binary),
        entries: bundle.entry.length,
        errors,
      });
      await exec.completeJob(systemRepo, {
        resourceType: 'Parameters',
        parameter: [{ name: 'results', valueReference: createReference(binary) }],
      });
    } else {
      logger.warn('Async batch request failed', {
        jobId: job.id,
        asyncJob: job.data.asyncJob.id,
        outcome,
      });
      await exec.failJob(systemRepo, new OperationOutcomeError(outcome));
    }
  } catch (err: any) {
    logger.error(`Async batch unhandled exception`, err);
    // Try to mark AsyncJob as failed, best effort
    await exec.failJob(systemRepo, new OperationOutcomeError(serverError(err))).catch(() => {});
  }
}
