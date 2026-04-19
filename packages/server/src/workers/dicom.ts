// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { createReference, isGone, normalizeOperationOutcome } from '@medplum/core';
import type { Binary, DicomInstance } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import dcmjs from 'dcmjs';
import { Readable } from 'node:stream';
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
  if (resource.raw?.reference !== previousVersion?.raw?.reference) {
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
 * Executes a DICOM processor job.
 * @param job - The DICOM processor job details.
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
    const binary = await systemRepo.readReference(resource.raw);
    const stream = await getBinaryStorage().readBinary(binary);
    const listener = new DicomMetadataListener();
    listener.startObject({});
    const reader = new AsyncDicomReader();
    await reader.stream.fromAsyncStream(stream);
    const result = await reader.readFile({ listener });

    const meta = result.meta as Record<string, unknown> | undefined;
    if (!meta) {
      log.info('No DICOM metadata found in instance', { id });
      return;
    }

    const dict = result.dict as Record<string, unknown> | undefined;
    if (!dict) {
      log.info('No DICOM metadata found in instance', { id });
      return;
    }

    const naturalized = DicomMetaDictionary.naturalizeDataset({ ...meta, ...dict }) as Record<string, unknown>;
    const pixelData = naturalized.PixelData;
    if (!pixelData) {
      log.info('No PixelData found in DICOM instance', { id });
      return;
    }

    if (!Array.isArray(pixelData) || pixelData.length === 0) {
      log.info('PixelData is empty or not an array', { id, pixelData });
      return;
    }

    const transferSyntaxUid = naturalized.TransferSyntaxUID as string | undefined;
    const contentType = getContentTypeForTransferSyntax(transferSyntaxUid);
    const securityContext = createReference(resource);
    const binaries: Binary[] = [];

    async function processPixelData(pixelData: unknown): Promise<void> {
      if (Array.isArray(pixelData)) {
        for (const entry of pixelData) {
          await processPixelData(entry);
        }
      } else if (pixelData instanceof ArrayBuffer) {
        const buffer = Buffer.from(pixelData);
        const readable = Readable.from(buffer);
        const binary = await systemRepo.createResource<Binary>({
          resourceType: 'Binary',
          contentType,
          meta: {
            project: resource.meta?.project,
          },
          securityContext,
        });
        await getBinaryStorage().writeBinary(binary, 'pixeldata.bin', contentType, readable);
        binaries.push(binary);
      } else {
        log.info('Unexpected PixelData format', { id, pixelData });
      }
    }

    await processPixelData(pixelData);

    await systemRepo.patchResource('DicomInstance', id, [
      { op: 'replace', path: '/meta/author', value: { reference: 'system' } },
      {
        op: resource.pixelData ? 'replace' : 'add',
        path: '/pixelData',
        value: binaries.map(createReference),
      },
    ]);
  } catch (err) {
    log.info('DICOM processing error', { id, err });
    throw err;
  }
}

function getContentTypeForTransferSyntax(transferSyntaxUID: string | undefined): string {
  switch (transferSyntaxUID) {
    case '1.2.840.10008.1.2.4.50':
      return 'image/jpeg';
    case '1.2.840.10008.1.2.4.57':
      return 'image/jpeg';
    case '1.2.840.10008.1.2.4.70':
      return 'image/jpeg';
    case '1.2.840.10008.1.2.4.90':
      return 'image/jp2';
    case '1.2.840.10008.1.2.4.91':
      return 'image/jp2';
    case '1.2.840.10008.1.2.4.201':
      return 'image/jxl';
    case '1.2.840.10008.1.2.4.202':
      return 'image/jxl';
    default:
      return 'application/octet-stream';
  }
}
