// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { Repository } from '../../fhir/repo';
import { MigrationAction } from '../types';

export interface PostDeployJobData {
  readonly type: 'reindex' | 'custom' | 'dynamic';
  readonly asyncJobId: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

export type PostDeployJobRunResult = 'finished' | 'interrupted' | 'ineligible';
export interface PostDeployMigration<T extends PostDeployJobData = PostDeployJobData> {
  readonly type: T['type'];
  /** Prepares the job data needed to run the migration */
  prepareJobData(asyncJob: WithId<AsyncJob>): T;
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
  run(repo: Repository, job: Job<T> | undefined, data: T): Promise<PostDeployJobRunResult>;
}

// Custom Jobs
export interface CustomPostDeployMigrationJobData extends PostDeployJobData {
  readonly type: 'custom';
}

export interface CustomPostDeployMigration extends PostDeployMigration<CustomPostDeployMigrationJobData> {
  type: 'custom';
}

// Dynamic Migration Jobs
export interface DynamicPostDeployJobData extends PostDeployJobData {
  readonly type: 'dynamic';
  readonly migrationActions: MigrationAction[];
}

export interface DynamicPostDeployMigration extends PostDeployMigration<DynamicPostDeployJobData> {
  type: 'dynamic';
}
