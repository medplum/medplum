// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { isGone, normalizeOperationOutcome } from '@medplum/core';
import type { DicomInstance } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import type { DcmjsDicomDict } from 'dcmjs';
import dcmjs from 'dcmjs';
import { tryGetRequestContext, tryRunInRequestContext } from '../context';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { getLogger, globalLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { getBullmqRedisConnectionOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

// eslint-disable-next-line import/no-named-as-default-member
const { async, data, utilities } = dcmjs;
const { AsyncDicomReader } = async;
const { DicomMetaDictionary } = data;
const { DicomMetadataListener } = utilities;

/*
 * The DICOM worker processes DICOM instances, extracts metadata, and updates corresponding resources.
 */

export interface DicomJobData {
  readonly id: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'DicomQueue';
const jobName = 'DicomJobData';

export const initDicomWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const defaultOptions: QueueBaseOptions = {
    connection: getBullmqRedisConnectionOptions(config),
  };

  const queue = new Queue<DicomJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  let worker: Worker<DicomJobData> | undefined;
  if (options?.workerEnabled !== false) {
    const workerBullmq = getWorkerBullmqConfig(config, 'download');
    worker = new Worker<DicomJobData>(
      queueName,
      (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execDicomJob(job)),
      {
        ...defaultOptions,
        ...workerBullmq,
      }
    );
    worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
    worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
  }

  return { queue, worker, name: queueName };
};

/**
 * Returns the DICOM queue instance.
 * This is used by the unit tests.
 * @returns The DICOM queue (if available).
 */
export function getDicomQueue(): Queue<DicomJobData> | undefined {
  return queueRegistry.get(queueName);
}

/**
 * Adds DICOM jobs for a given resource.
 * Only enqueues jobs for DicomInstance resources.
 * Only enqueues jobs if DicomInstance.rawData is added or updated.
 * @param resource - The resource that was created or updated.
 * @param previousVersion - The previous version of the resource, if available
 */
export async function addDicomJobs(resource: WithId<DicomInstance>, previousVersion: DicomInstance): Promise<void> {
  if (resource.rawData?.reference !== previousVersion?.rawData?.reference) {
    const ctx = tryGetRequestContext();
    await addDicomJobData({
      id: resource.id,
      requestId: ctx?.requestId,
      traceId: ctx?.traceId,
    });
  }
}

/**
 * Adds a download job to the queue.
 * @param job - The download job details.
 */
async function addDicomJobData(job: DicomJobData): Promise<void> {
  const queue = getDicomQueue();
  if (queue) {
    await queue.add(jobName, job);
  }
}

/**
 * Executes a download job.
 * @param job - The download job details.
 */
export async function execDicomJob(job: Job<DicomJobData>): Promise<void> {
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be part of job.data in future
  const log = getLogger();
  const { id } = job.data;

  let resource: WithId<DicomInstance>;
  try {
    resource = await systemRepo.readResource<DicomInstance>('DicomInstance', id);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isGone(outcome)) {
      // If the resource was deleted, then stop processing it.
      return;
    }
    throw err;
  }

  try {
    const binary = await systemRepo.readReference(resource.rawData);
    const stream = await getBinaryStorage().readBinary(binary);
    const listener = new DicomMetadataListener();
    listener.startObject({});
    const reader = new AsyncDicomReader();
    await reader.stream.fromAsyncStream(stream);
    const result = await reader.readFile({ listener });
    const naturalized = DicomMetaDictionary.naturalizeDataset(result.dict as DcmjsDicomDict) as Record<string, unknown>;

    // TODO: Extract PixelData to separate Binary resource and reference it from DicomInstance.pixelData

    if (naturalized.PixelData) {
      console.log('CODY PixelData found, length', (naturalized.PixelData as Uint8Array).length);
    }
  } catch (err) {
    log.info('DICOM processing error', { id, err });
    throw err;
  }
}
