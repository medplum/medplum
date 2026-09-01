// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Logger, Operation, WithId } from '@medplum/core';
import { createReference, isGone, isString, normalizeOperationOutcome, Operator, resolveId } from '@medplum/core';
import type { Binary, DicomInstance, DicomStudy, Reference } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import dcmjs from 'dcmjs';
import { Readable } from 'node:stream';
import { tryGetRequestContext, tryRunInRequestContext } from '../context';
import { reconcileImagingStudy } from '../dicom/imaging-study';
import { scanStudy, updateSeriesAggregates, updateStudyAggregates } from '../dicom/utils';
import type { Repository } from '../fhir/repo';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { getLogger, globalLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { defaultQueueOptions, getWorkerBullmqConfig, queueRegistry, trackJobMetrics } from './utils';

// eslint-disable-next-line import/no-named-as-default-member
const { async, data, utilities } = dcmjs;
const { AsyncDicomReader } = async;
const { DicomMetaDictionary } = data;
const { DicomMetadataListener } = utilities;

/*
 * DICOM processing, split by the cardinality of the work rather than by how the bytes arrived.
 *
 * `DicomJobData` runs once per instance: parse the file, fill in the instance attributes, split out
 * the pixel data. `DicomStudyJobData` runs once per study and is coalesced, because the study level
 * work - the Q/R aggregates and the derived `ImagingStudy` - costs the same whether one instance
 * arrived or five hundred did. Both a DICOMweb STOW and a directly created `DicomInstance` enqueue
 * both, so neither entry point can drift away from the other.
 *
 * They share one queue rather than getting one each: `deduplication` is a per-job option, so the
 * coalescing works either way, and a single queue cannot be half-enabled by configuration or close
 * out from under an instance job that is still draining and needs to enqueue its study job.
 */

export interface DicomJobData {
  readonly id: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

export interface DicomStudyJobData {
  readonly studyId: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

/** Both job types share one queue, discriminated by job name. */
export type DicomQueueJobData = DicomJobData | DicomStudyJobData;

const queueName = 'DicomQueue';
const jobName = 'DicomJobData';
const studyJobName = 'DicomStudyJobData';

export const initDicomWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const defaultOptions = defaultQueueOptions(config);
  const queue = new Queue<DicomQueueJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  let worker: Worker<DicomQueueJobData> | undefined;
  if (options?.workerEnabled !== false) {
    worker = new Worker<DicomQueueJobData>(
      queueName,
      trackJobMetrics('dicom', (job) =>
        tryRunInRequestContext(job.data.requestId, job.data.traceId, () =>
          job.name === studyJobName
            ? execDicomStudyJob(job as Job<DicomStudyJobData>)
            : execDicomJob(job as Job<DicomJobData>)
        )
      ),
      getWorkerBullmqConfig(config, 'dicom', defaultOptions)
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
export function getDicomQueue(): Queue<DicomQueueJobData> | undefined {
  return queueRegistry.get(queueName);
}

/**
 * Enqueues the study level work for a study, collapsing a burst of instances into one run.
 *
 * `keepLastIfActive` bounds a study to one running job plus one waiting job, so a five hundred
 * instance upload does not schedule five hundred full recomputations. It is a cost control, not a
 * correctness guarantee: a stalled job is requeued without releasing the deduplication key, so
 * `execDicomStudyJob` re-checks for late arrivals itself rather than trusting the queue to be exact.
 *
 * @param studyId - The ID of the `DicomStudy` to recompute.
 */
export async function addDicomStudyJob(studyId: string): Promise<void> {
  const queue = getDicomQueue();
  if (!queue) {
    return;
  }
  const ctx = tryGetRequestContext();
  await queue.add(
    studyJobName,
    { studyId, requestId: ctx?.requestId, traceId: ctx?.traceId },
    { deduplication: { id: `dicom-study:${studyId}`, keepLastIfActive: true } }
  );
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
    // Enqueued here as well as after the instance job succeeds, so a study still converges when an
    // instance fails permanently - a corrupt file should not hold back the counts for its siblings.
    await addStudyJobForInstance(resource);
  }
}

/**
 * Enqueues the study level work for whichever study an instance belongs to.
 * @param resource - The instance whose study should be recomputed.
 */
async function addStudyJobForInstance(resource: DicomInstance): Promise<void> {
  const studyId = resolveId(resource.study);
  if (studyId) {
    await addDicomStudyJob(studyId);
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
    const dict = result.dict as Record<string, unknown> | undefined;
    if (!meta || !dict) {
      log.info('No DICOM metadata found in instance', { id });
      return;
    }

    const naturalized = DicomMetaDictionary.naturalizeDataset({ ...meta, ...dict }) as Record<string, unknown>;
    const pixelData = await extractPixelData(systemRepo, resource, naturalized, log);

    // Patched rather than updated: the parse and the pixel extraction above can take a while, and a
    // read-modify-write spanning them would clobber anything written to the instance in between.
    const patch = buildInstancePatch(resource, {
      instanceAvailability: naturalized.InstanceAvailability,
      timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC,
      instanceNumber: toInstanceNumber(naturalized.InstanceNumber),
      rows: naturalized.Rows,
      columns: naturalized.Columns,
      bitsAllocated: naturalized.BitsAllocated,
      numberOfFrames: naturalized.NumberOfFrames,
      pixelData,
    });
    if (patch.length > 0) {
      await systemRepo.patchResource('DicomInstance', id, patch);
    }
  } catch (err) {
    log.info('DICOM processing error', { id, err });
    throw err;
  }

  // After the instance is stored, not in a `finally`: a job that threw will be retried, and each
  // retry would otherwise schedule another full study recomputation against an unhealthy system.
  await addStudyJobForInstance(resource);
}

/**
 * Builds the patch for the attributes read out of an instance's dataset.
 *
 * An attribute the dataset does not carry is skipped rather than patched to null: JSON Patch has no
 * value to write, and an instance whose file omits an element is not a reason to erase whatever the
 * uploader recorded for it.
 *
 * @param resource - The stored instance, read to choose between `add` and `replace`.
 * @param values - The attribute values read from the dataset.
 * @returns The patch operations to apply.
 */
function buildInstancePatch(resource: WithId<DicomInstance>, values: Record<string, unknown>): Operation[] {
  const patch: Operation[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      const op = resource[key as keyof DicomInstance] === undefined ? 'add' : 'replace';
      patch.push({ op, path: `/${key}`, value });
    }
  }
  return patch;
}

/**
 * Recomputes everything derived from a study: the DICOM Q/R aggregates and the `ImagingStudy`.
 *
 * @param job - The DICOM study job details.
 */
export async function execDicomStudyJob(job: Job<DicomStudyJobData>): Promise<void> {
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be part of job.data in future
  const log = getLogger();
  const { studyId } = job.data;

  let study: WithId<DicomStudy>;
  try {
    study = await systemRepo.readResource<DicomStudy>('DicomStudy', studyId);
  } catch (err) {
    if (isGone(normalizeOperationOutcome(err))) {
      return;
    }
    throw err;
  }

  const watermark = await readInstanceWatermark(systemRepo, studyId);
  const scan = await scanStudy(systemRepo, studyId);

  // Aggregates are committed before the ImagingStudy, and the ImagingStudy failure is caught, so a
  // series that cannot produce a valid ImagingStudy - a missing Modality, say - does not also stop
  // the Q/R counts from ever converging again.
  await updateStudyAggregates(systemRepo, studyId, scan);
  await updateSeriesAggregates(systemRepo, scan);

  try {
    await reconcileImagingStudy(systemRepo, study, scan);
  } catch (err) {
    log.error('Error reconciling ImagingStudy', { studyId, err });
  }

  // The queue collapses overlapping runs, but a stalled job is requeued without releasing its
  // deduplication key, so an instance can commit after this job read the study and still be dropped.
  // Re-checking here means convergence does not depend on the queue being exact.
  if ((await readInstanceWatermark(systemRepo, studyId)) !== watermark) {
    await addDicomStudyJob(studyId);
  }
}

/**
 * Returns the most recent instance write time for a study.
 * @param systemRepo - The repository to read with.
 * @param studyId - The ID of the `DicomStudy`.
 * @returns The latest `meta.lastUpdated` across the study's instances, or undefined if it has none.
 */
async function readInstanceWatermark(systemRepo: Repository, studyId: string): Promise<string | undefined> {
  const latest = await systemRepo.searchResources<DicomInstance>({
    resourceType: 'DicomInstance',
    filters: [{ code: 'study', operator: Operator.EQUALS, value: `DicomStudy/${studyId}` }],
    sortRules: [{ code: '_lastUpdated', descending: true }],
    count: 1,
  });
  return latest[0]?.meta?.lastUpdated;
}

/**
 * Writes each frame of PixelData to its own Binary.
 * @param systemRepo - The repository to write with.
 * @param resource - The instance being processed, used as the security context for the frames.
 * @param naturalized - The naturalized DICOM dataset.
 * @param log - The logger to report unusable PixelData to.
 * @returns References to the frame Binaries, or undefined if the instance carries no PixelData.
 */
async function extractPixelData(
  systemRepo: Repository,
  resource: WithId<DicomInstance>,
  naturalized: Record<string, unknown>,
  log: Logger
): Promise<Reference<Binary>[] | undefined> {
  const { id } = resource;
  const pixelData = naturalized.PixelData;
  if (!pixelData) {
    log.info('No PixelData found in DICOM instance', { id });
    return undefined;
  }

  if (!Array.isArray(pixelData) || pixelData.length === 0) {
    log.info('PixelData is empty or not an array', { id, pixelData });
    return undefined;
  }

  const contentType = getContentTypeForTransferSyntax(naturalized.TransferSyntaxUID as string | undefined);
  const securityContext = createReference(resource);
  const binaries: Binary[] = [];

  async function processPixelData(pixelData: unknown): Promise<void> {
    if (Array.isArray(pixelData)) {
      for (const entry of pixelData) {
        await processPixelData(entry);
      }
    } else if (pixelData instanceof ArrayBuffer) {
      const readable = Readable.from(Buffer.from(pixelData));
      const binary = await systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType,
        meta: { project: resource.meta?.project },
        securityContext,
      });
      await getBinaryStorage().writeBinary(binary, 'pixeldata.bin', contentType, readable);
      binaries.push(binary);
    } else {
      log.info('Unexpected PixelData format', { id, pixelData });
    }
  }

  await processPixelData(pixelData);
  return binaries.map(createReference);
}

/**
 * Returns InstanceNumber (0020,0013) as a string, defaulting to "1".
 * @param value - The naturalized InstanceNumber, which dcmjs may give as a string or a number.
 * @returns The instance number.
 */
function toInstanceNumber(value: unknown): string {
  if (isString(value)) {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return '1'; // InstanceNumber is required in DICOM, so a missing one is filled in rather than dropped
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
