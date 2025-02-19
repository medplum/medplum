import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo, Repository } from '../fhir/repo';
import { getStatus, OperationOutcomeError } from '@medplum/core';

export interface LongJobData {
  asyncJob: AsyncJob;
}

const inProgressJobStatus: AsyncJob['status'][] = ['accepted', 'active'];

export abstract class LongJob<TResult extends {}, TData extends LongJobData> {
  private systemRepo: Repository;

  constructor(systemRepo?: Repository) {
    this.systemRepo = systemRepo ?? getSystemRepo();
  }

  async updateStatus(job: Job<TData>, output: Parameters): Promise<void> {
    const exec = new AsyncJobExecutor(this.systemRepo, job.data.asyncJob);
    const updatedJob = await exec.updateJobProgress(this.systemRepo, output, {
      // Conditional update to ensure this update does not clobber another,
      // which could result in e.g. continuing a job that was cancelled
      ifMatch: job.data.asyncJob.meta?.versionId,
    });

    if (updatedJob) {
      job.data.asyncJob = updatedJob;
    }
  }

  async finishJob(job: Job<TData>, output?: Parameters): Promise<void> {
    const exec = new AsyncJobExecutor(this.systemRepo, job.data.asyncJob);
    await exec.completeJob(this.systemRepo, output);
  }

  async failJob(job: Job<TData>, err?: Error): Promise<void> {
    const exec = new AsyncJobExecutor(this.systemRepo, job.data.asyncJob);
    await exec.failJob(this.systemRepo, err);
  }

  async checkJobStatus(job: Job<TData>): Promise<boolean> {
    const asyncJob = await this.systemRepo.readResource<AsyncJob>('AsyncJob', job.data.asyncJob.id as string);

    if (!inProgressJobStatus.includes(asyncJob.status)) {
      return false;
    }

    job.data.asyncJob = asyncJob;
    return true;
  }

  async execute(job: Job<TData>): Promise<void> {
    const canStart = await this.checkJobStatus(job);
    if (!canStart) {
      // Job is not in-progress, terminate early
      return;
    }

    try {
      const result = await this.process(job);

      // Check if AsyncJob resource should be updated; this usually
      // happens less frequently than every iteration
      const output = this.formatResults(result, job);
      if (output) {
        try {
          await this.updateStatus(job, output);
        } catch (err) {
          if (err instanceof OperationOutcomeError && getStatus(err.outcome) === 412) {
            // Conflict: AsyncJob was updated by another party between when the job started and now!
            // Check status to see if job was cancelled
            const canContinue = await this.checkJobStatus(job);
            if (!canContinue) {
              // Job was cancelled or errored in parallel; this iteration should abort
              return;
            }
          }

          throw err;
        }
      }

      const nextIteration = this.nextIterationData(result, job);
      if (typeof nextIteration === 'boolean') {
        // Job is complete, no more iterations should be enqueued
        const jobSucceeded = nextIteration;
        if (jobSucceeded) {
          await this.finishJob(job, output);
        } else {
          await this.failJob(job);
        }
      } else {
        // Enqueue job for the specified next iteration
        // NOTE: We do not check the AsyncJob status before enqueuing: it will be checked
        // at the beginning of the next iteration
        await this.enqueueJob(nextIteration);
      }
    } catch (err: unknown) {
      await this.failJob(job, err as Error);
    }
  }

  /**
   * Handles processing one iteration of the job, from the given job data.
   * @param job - The current job iteration data to process.
   * @returns The result for the current iteration of the job.
   */
  abstract process(job: Job<TData>): Promise<TResult>;

  /**
   * Format the results of the current iteration for updating the corresponding AsyncJob resource.
   * Return `undefined` to skip updating the resource for this iteration.
   * @param result - The current iteration result.
   * @param job  - The current job data.
   * @returns Data with which to update the AsyncJob resource, or undefined to skip updating the resource.
   */
  abstract formatResults(result: TResult, job: Job<TData>): Parameters | undefined;

  /**
   * Constructs the data for the next iteration of this job, if it should be continued.
   * @param result - The result of the current iteration of the job.
   * @param job - The current job iteration data.
   * @returns The next job data object, or boolean if the job is complete (true = success, false = failure).
   * @throws On catastrophic error, which will fail the AsyncJob and update it with error details.
   */
  abstract nextIterationData(result: TResult, job: Job<TData>): TData | boolean;

  /**
   * Enqueues the next iteration of the job.
   * @param data - The job data to enqueue.
   * @returns The created job.
   */
  abstract enqueueJob(data: TData): Promise<Job<TData>>;
}
