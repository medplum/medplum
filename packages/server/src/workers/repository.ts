// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AsyncJob } from '@medplum/fhirtypes';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import type { AsyncJobTracking, JobTarget } from './base';

/**
 * Returns a system repository routed to the explicit durable job target.
 * @param target - The job's serialized routing target.
 * @returns A system repository routed to the target project, shard, or global resources.
 */
export async function getJobSystemRepo(target: JobTarget): Promise<SystemRepository> {
  switch (target.kind) {
    case 'project':
      if (target.system) {
        return getShardSystemRepo(GLOBAL_SHARD_ID);
      } else {
        return getProjectSystemRepo(target.projectId);
      }
    case 'shard':
      return getShardSystemRepo(target.shardId);
    default:
      target satisfies never;
      throw new TypeError(`Unsupported job target kind: ${(target as any).kind}`);
  }
}

/**
 * Hydrates the AsyncJob from its independently serialized owner and returns an executor bound to
 * that repository. The job's work target is intentionally unrelated to the AsyncJob's location.
 * @param tracking - The serialized location and ID of the tracking AsyncJob.
 * @returns An executor ready to inspect or update the AsyncJob.
 */
export async function getTrackingAsyncJobExecutor(tracking: AsyncJobTracking): Promise<AsyncJobExecutor> {
  const asyncJobSystemRepo =
    tracking.owner === 'project' ? await getProjectSystemRepo(tracking.projectId) : getShardSystemRepo(GLOBAL_SHARD_ID);
  const asyncJob = await asyncJobSystemRepo.readResource<AsyncJob>('AsyncJob', tracking.asyncJobId);

  return new AsyncJobExecutor(asyncJobSystemRepo, asyncJob);
}
