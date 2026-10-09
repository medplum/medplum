// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { assert } from '@medplum/core';
import type { AsyncJob, Group } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getAuthenticatedContext, runInAuthenticatedContext } from '../context';
import { exportResources } from '../fhir/operations/export';
import { groupExportResources } from '../fhir/operations/groupexport';
import { BulkExporter } from '../fhir/operations/utils/bulkexporter';
import { globalLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import type { AsyncJobTracking } from './base';
import { getAsyncJobTracking, getTrackingAsyncJobExecutor } from './base';
import type { WorkerInitializer } from './utils';
import { defaultQueueOptions, getWorkerBullmqConfig, isJobActive, queueRegistry, trackJobMetrics } from './utils';

export interface BulkExportJobData {
  readonly tracking: AsyncJobTracking;
  readonly authState: Readonly<AuthState>;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly exportLevel: 'System' | 'Patient' | 'Group';
  readonly types?: string[];
  readonly since?: string;
  readonly typeFilters?: SearchRequest[];
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
  worker?.on('failed', async (job, err) => {
    if (!job) {
      return;
    }
    try {
      const exec = await getTrackingAsyncJobExecutor(job.data.tracking);
      if (isJobActive(exec.getAsyncJob())) {
        await exec.failJob(err);
      }
    } catch (failErr) {
      globalLogger.error('Failed to mark bulk export as failed', { jobId: job.id, error: failErr });
    }
  });
  return { name: queueName, queue, worker };
};

export async function queueBulkExport(
  asyncJob: WithId<AsyncJob>,
  params: Pick<BulkExportJobData, 'exportLevel' | 'types' | 'since' | 'typeFilters' | 'groupId'>
): Promise<void> {
  const { authState, requestId, traceId } = getAuthenticatedContext();
  const queue = queueRegistry.get<BulkExportJobData>(queueName);
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  const data: BulkExportJobData = { ...params, tracking: getAsyncJobTracking(asyncJob), authState, requestId, traceId };
  await queue.add('BulkExport', data, { jobId: asyncJob.id });
}

export async function execBulkExportJob(job: Job<BulkExportJobData>): Promise<void> {
  const exec = await getTrackingAsyncJobExecutor(job.data.tracking);
  if (!isJobActive(exec.getAsyncJob())) {
    return;
  }
  const { authState, requestId, traceId, exportLevel, types, since, typeFilters, groupId } = job.data;
  await runInAuthenticatedContext(authState, requestId, traceId, { async: true }, async () => {
    const { repo, project } = getAuthenticatedContext();
    const exporter = new BulkExporter(repo, exec.getAsyncJob());
    if (exportLevel === 'Group') {
      assert(groupId, 'Group export requires a group ID');
      const group = await repo.readResource<Group>('Group', groupId);
      await groupExportResources(repo, exporter, project, group, types, since);
    } else {
      await exportResources(exporter, project, types, exportLevel, since, typeFilters);
    }
  });
}
