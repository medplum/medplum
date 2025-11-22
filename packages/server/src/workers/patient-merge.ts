// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob, Patient, Reference } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getUserConfiguration } from '../auth/me';
import { runInAsyncContext } from '../context';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { executeMerge } from '../fhir/operations/patientmerge';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import type { AuthState } from '../oauth/middleware';
import type { WorkerInitializer } from './utils';
import { queueRegistry } from './utils';

/*
 * The patient-merge worker asynchronously merges two patient records,
 * decoupled from an individual HTTP request.
 */

export interface PatientMergeJobData {
  readonly asyncJob: WithId<AsyncJob>;
  readonly sourcePatient: Reference<Patient>;
  readonly targetPatient: Reference<Patient>;
  readonly authState: Readonly<AuthState>;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'PatientMergeQueue';
const jobName = 'PatientMergeJobData';

export const initPatientMergeWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  const queue = new Queue<PatientMergeJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: { attempts: 1 },
  });

  const worker = new Worker<PatientMergeJobData>(
    queueName,
    (job) => {
      const { authState, requestId, traceId } = job.data;
      return runInAsyncContext(authState, requestId, traceId, () => execPatientMergeJob(job));
    },
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );

  return { queue, worker, name: queueName };
};

/**
 * Returns the patient merge queue instance.
 * This is used by the unit tests.
 * @returns The patient merge queue (if available).
 */
export function getPatientMergeQueue(): Queue<PatientMergeJobData> | undefined {
  return queueRegistry.get(queueName);
}

/**
 * Adds a patient merge job to the queue.
 * @param job - The patient merge job details.
 * @returns The enqueued job.
 */
export async function addPatientMergeJobData(job: PatientMergeJobData): Promise<Job<PatientMergeJobData>> {
  const queue = queueRegistry.get<PatientMergeJobData>(queueName);
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add(jobName, job);
}

export async function execPatientMergeJob(job: Job<PatientMergeJobData>): Promise<void> {
  const { sourcePatient, targetPatient } = job.data;
  const { login, project, membership } = job.data.authState;
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);

  // Prepare the original submitting user's repo
  const userConfig = await getUserConfiguration(systemRepo, project, membership);
  const repo = await getRepoForLogin({ login, project, membership, userConfig }, true);

  try {
    const result = await executeMerge(repo, sourcePatient, targetPatient);

    const outputParams = {
      resourceType: 'Parameters' as const,
      parameter: [
        { name: 'return', resource: result.target },
        { name: 'resourcesUpdated', valueInteger: result.resourcesUpdated },
      ],
    };

    await exec.completeJob(repo, outputParams);
  } catch (err) {
    await exec.failJob(repo, err as Error);
  }
}

