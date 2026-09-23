// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import type { SystemRepository } from '../../fhir/repo';
import type { AsyncJobTracking, ShardJobTarget } from '../../workers/base';
import type { PhasalMigration } from '../types';

export type PostDeployJobData = {
  readonly type: 'reindex' | 'custom' | 'dynamic';
  readonly requestId?: string;
  readonly traceId?: string;
  readonly skipInFirstBootMode?: boolean;
} & (NewPostDeployJobData | LegacyPostDeployJobData);

interface NewPostDeployJobData {
  readonly target: ShardJobTarget;
  readonly tracking: AsyncJobTracking;
  readonly asyncJobId?: never;
}
// PENDING{v5.2+} remove LegacyPostDeployJobData and switch back to interfaces for all *JobData in this file
interface LegacyPostDeployJobData {
  readonly asyncJobId: string;
}

export interface PrepareJobDataContext {
  shardId: string;
  asyncJob: WithId<AsyncJob>;
}

export type PostDeployJobRunResult = 'finished' | 'interrupted' | 'ineligible';
export interface PostDeployMigration<T extends PostDeployJobData = PostDeployJobData> {
  readonly type: T['type'];
  /** Prepares the job data needed to run the migration */
  prepareJobData(ctx: PrepareJobDataContext): T;
  /**
   * Runs the migration. Is responsible for updating AsyncJob.status and AsyncJob.output,
   * generally through usage `AsyncJobExecutor`
   *
   * @param repo - A repository instance
   * @param job - The full BullMQ job instance if the migration is running through BullMQ, otherwise undefined
   * @param data - The job data to use while running the migration logic
   * @returns - Returns one of:
   * 'finished' if the job either succeeded or failed,
   * 'interrupted' if the job detected that the AsyncJob was cancelled, paused, etc. out of band,
   * 'ineligible' if the processor decided it was not capable of running the job, typically
   *            due to being an outdated version of Medplum.
   */
  run(repo: SystemRepository, job: Job<T> | undefined, data: T): Promise<PostDeployJobRunResult>;
}

// Custom Jobs
export type CustomPostDeployMigrationJobData = PostDeployJobData & {
  readonly type: 'custom';
};

export interface CustomPostDeployMigration extends PostDeployMigration<CustomPostDeployMigrationJobData> {
  type: 'custom';
}

// Dynamic Migration Jobs
export type DynamicPostDeployJobData = PostDeployJobData & {
  readonly type: 'dynamic';
  readonly migrationActions: PhasalMigration;
};

export interface DynamicPostDeployMigration extends PostDeployMigration<DynamicPostDeployJobData> {
  type: 'dynamic';
}
