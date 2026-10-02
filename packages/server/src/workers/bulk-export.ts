// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { assert, normalizeErrorString } from '@medplum/core';
import type { AsyncJob, Group, ResourceType } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { DelayedError, Queue, Worker } from 'bullmq';
import { getAuthenticatedContext, runInAuthenticatedContext } from '../context';
import { BulkExporter, exportResources, groupExportResources } from '../fhir/operations/utils/bulkexporter';
import { getLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import type { AsyncJobTracking } from './base';
import { getAsyncJobTracking, getTrackingAsyncJobExecutor } from './base';
import type { WorkerInitializer } from './utils';
import {
  CancelledError,
  defaultQueueOptions,
  getWorkerBullmqConfig,
  isJobActive,
  moveToDelayedAndThrow,
  queueRegistry,
  trackJobMetrics,
} from './utils';

export interface BulkExportJobData {
  readonly tracking: AsyncJobTracking;
  readonly authState: Readonly<AuthState>;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly exportLevel: 'System' | 'Patient' | 'Group';
  readonly types?: string[];
  readonly since?: string;
  readonly groupId?: string;
}

const queueName = 'BulkExportQueue';

export const initBulkExportWorker: WorkerInitializer = (config, options) => {
  const queueOptions = defaultQueueOptions(config);
  const queue = new Queue<BulkExportJobData>(queueName, {
    ...queueOptions,
    defaultJobOptions: { ...queueOptions.defaultJobOptions, attempts: 1 },
  });
  const worker =
    options?.workerEnabled === false
      ? undefined
      : new Worker<BulkExportJobData>(
          queueName,
          trackJobMetrics('bulk-export', execBulkExportJob),
          getWorkerBullmqConfig(config, 'bulk-export', queueOptions, { concurrency: 1 })
        );
  // Covers failures the processor can't report itself, e.g. exceeding maxStalledCount.
  // Usually redundant with execBulkExportJob's own failExport, which is a no-op once the AsyncJob is inactive.
  worker?.on('failed', (job, err) => {
    if (job) {
      failExport(job.data, err).catch((error) => getLogger().error('Unable to fail bulk export', { error }));
    }
  });
  return { name: queueName, queue, worker };
};

async function failExport(data: BulkExportJobData, err: unknown): Promise<void> {
  const exec = await getTrackingAsyncJobExecutor(data.tracking);
  const resource = exec.getAsyncJob();
  if (isJobActive(resource)) {
    await exec.repo.getSystemRepo().updateResource<AsyncJob>(
      {
        ...resource,
        status: 'error',
        transactionTime: new Date().toISOString(),
        output: { resourceType: 'Parameters', parameter: [{ name: 'error', valueString: normalizeErrorString(err) }] },
      },
      { ifMatch: resource.meta?.versionId }
    );
  }
}

export async function queueBulkExport(
  asyncJob: WithId<AsyncJob>,
  params: Pick<BulkExportJobData, 'exportLevel' | 'types' | 'since' | 'groupId'>
): Promise<void> {
  const { authState, requestId, traceId } = getAuthenticatedContext();
  const data: BulkExportJobData = { ...params, tracking: getAsyncJobTracking(asyncJob), authState, requestId, traceId };
  try {
    const queue = queueRegistry.get<BulkExportJobData>(queueName);
    if (!queue) {
      throw new Error('Bulk export queue unavailable');
    }
    await queue.add('BulkExport', data, { jobId: asyncJob.id });
  } catch (err) {
    await failExport(data, err);
    throw err;
  }
}

/**
 * Replays the entire export with fresh files; only a successful attempt publishes its manifest.
 * @param job - The queued export request.
 */
export async function execBulkExportJob(job: Job<BulkExportJobData>): Promise<void> {
  const exec = await getTrackingAsyncJobExecutor(job.data.tracking);
  if (!isJobActive(exec.getAsyncJob())) {
    return;
  }
  const { authState, requestId, traceId, exportLevel, types, since, groupId } = job.data;
  await runInAuthenticatedContext(authState, requestId, traceId, { async: true }, async () => {
    const { repo, project } = getAuthenticatedContext();
    let lastCheck = 0;
    const checkInterrupted = async (): Promise<void> => {
      if (queueRegistry.isClosing(job.queueName)) {
        throw new DelayedError('Bulk export delayed since queue is closing');
      }
      if (Date.now() - lastCheck >= 1000) {
        if (!isJobActive(await exec.refresh())) {
          throw new CancelledError();
        }
        lastCheck = Date.now();
      }
    };
    const exporter = new BulkExporter(repo, exec.getAsyncJob(), checkInterrupted);
    try {
      await checkInterrupted();
      if (exportLevel === 'Group') {
        assert(groupId, 'Group export requires a group ID');
        const group = await repo.readResource<Group>('Group', groupId);
        await groupExportResources(repo, exporter, project, group, { _type: types as ResourceType[], _since: since });
      } else {
        await exportResources(exporter, project, types, exportLevel, since);
      }
    } catch (err) {
      await exporter.abort();
      if (err instanceof DelayedError) {
        // Release upload resources before making the job available to another worker.
        await moveToDelayedAndThrow(job, err.message);
      }
      if (err instanceof CancelledError) {
        return;
      }
      await failExport(job.data, err);
      throw err;
    }
  });
}
