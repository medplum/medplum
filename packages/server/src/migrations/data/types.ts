import { WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Repository } from '../../fhir/repo';
import { Job } from 'bullmq';

export interface PostDeployJobData {
  readonly type: 'reindex' | 'custom';
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
   * @param data - The job data to use while running the migration logic
   * @param job - The full BullMQ job instance if the job was run through BullMQ, otherwise undefined
   * @returns - Returns one of:
   * 'finished' if the job either succeeded or failed,
   * 'interrupted' if the job detected that the AsyncJob was cancelled, paused, etc. out of band,
   * 'ineligible' if the processor decided it was not capable of running the job, typically
   *            due to being an outdated version of Medplum.
   */
  run(repo: Repository, data: T, job?: Job<T>): Promise<PostDeployJobRunResult>;
}

// Custom Jobs

export type CustomMigrationAction = { name: string; durationMs: number };
export type CustomMigrationResult = { actions: CustomMigrationAction[] };
export interface CustomPostDeployMigrationJobData extends PostDeployJobData {
  readonly type: 'custom';
}

export interface CustomPostDeployMigration extends PostDeployMigration<CustomPostDeployMigrationJobData> {
  type: 'custom';
}
