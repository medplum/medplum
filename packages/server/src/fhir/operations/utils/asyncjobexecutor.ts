import { OperationOutcomeError, WithId, accepted } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { DelayedError } from 'bullmq';
import { Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getConfig } from '../../../config/loader';
import { getAuthenticatedContext } from '../../../context';
import { DatabaseMode, getDatabasePool } from '../../../database';
import { getLogger } from '../../../logger';
import { markPostDeployMigrationCompleted } from '../../../migration-sql';
import { maybeAutoRunPendingPostDeployMigration } from '../../../migrations/migration-utils';
import { sendOutcome } from '../../outcomes';
import { Repository, getSystemRepo } from '../../repo';

export class AsyncJobExecutor {
  readonly repo: Repository;
  private resource: WithId<AsyncJob> | undefined;
  constructor(repo: Repository, resource?: WithId<AsyncJob>) {
    this.repo = repo.clone();
    this.resource = resource;
  }

  async init(url: string): Promise<AsyncJob> {
    if (!this.resource) {
      this.resource = await this.repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        request: url,
        requestTime: new Date().toISOString(),
      });
    }
    return this.resource;
  }
  /**
   * Begins execution of the async job and coordinates resource updates and logging throughout the job lifecycle.
   * @param callback - The callback to execute.
   */
  start(callback: (job: AsyncJob) => Promise<any>): void {
    // Rely on `startAsync` for error handling/logging
    this.startAsync(callback).catch(() => {});
  }

  /**
   * Executes the async job and coordinates resource updates and logging throughout the job lifecycle.
   * @param callback - The callback to execute.
   * @returns A promise that resolves when the job is completed or fails.
   */
  async startAsync(callback: (job: AsyncJob) => Promise<any>): Promise<AsyncJob | undefined> {
    const log = getLogger();
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }
    if (this.resource.status !== 'accepted') {
      throw new Error('Job already completed');
    }

    const startTime = Date.now();
    const systemRepo = getSystemRepo();
    log.info('AsyncJob execution starting', { name: callback.name, asyncJobId: this.resource?.id });

    return this.run(callback)
      .then(async (output) => {
        log.info('AsyncJob execution completed', {
          name: callback.name,
          asyncJobId: this.resource?.id,
          duration: `${Date.now() - startTime} ms`,
        });
        return this.completeJob(systemRepo, output);
      })
      .catch(async (err) => {
        log.error('AsyncJob execution failed', {
          name: callback.name,
          asyncJobId: this.resource?.id,
          error: err instanceof Error ? err.message : err.toString(),
          stack: err instanceof Error ? err.stack : undefined,
        });
        return this.failJob(systemRepo, err);
      })
      .finally(() => {
        this.repo[Symbol.dispose]();
      });
  }

  /**
   * Conditionally runs the job callback if the AsyncJob resource is in the correct state.
   * @param callback - The callback to execute.
   * @returns (optional) Output encoded as a Parameters resource.
   */
  async run(
    callback: ((job: WithId<AsyncJob>) => Promise<Parameters>) | ((job: WithId<AsyncJob>) => Promise<void>)
  ): Promise<Parameters | undefined> {
    callback = AsyncLocalStorage.bind(callback);
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }
    if (this.resource.status !== 'accepted') {
      throw new Error('Job already completed');
    }

    const output = await callback(this.resource);
    return output ?? undefined;
  }

  async completeJob(repo: Repository, output?: Parameters): Promise<AsyncJob> {
    if (!this.resource) {
      throw new Error('Cannot completeJob since AsyncJob is not specified');
    }
    let updatedJob: AsyncJob = {
      ...this.resource,
      status: 'completed',
      transactionTime: new Date().toISOString(),
      output,
    };
    if (updatedJob.type === 'data-migration' && updatedJob.dataVersion) {
      await markPostDeployMigrationCompleted(getDatabasePool(DatabaseMode.WRITER), updatedJob.dataVersion);
      updatedJob = await repo.updateResource<AsyncJob>(updatedJob);
      await maybeAutoRunPendingPostDeployMigration();
      return updatedJob;
    } else {
      return repo.updateResource<AsyncJob>(updatedJob);
    }
  }

  async failJob(repo: Repository, err?: Error): Promise<AsyncJob> {
    if (!this.resource) {
      throw new Error('Cannot failJob since AsyncJob is not specified');
    }

    // A job throwing `DelayedError` means the job has been delayed/re-queued,
    // so the job should not fail. Instead re-throw the error for BullMQ
    // to handle.
    if (err instanceof DelayedError) {
      throw err;
    }

    const failedJob: AsyncJob = {
      ...this.resource,
      status: 'error',
      transactionTime: new Date().toISOString(),
    };
    if (err) {
      failedJob.output = {
        resourceType: 'Parameters',
        parameter:
          err instanceof OperationOutcomeError
            ? [{ name: 'outcome', resource: err.outcome }]
            : [
                { name: 'error', valueString: err.message },
                { name: 'stack', valueString: err.stack },
              ],
      };
    }
    return repo.updateResource<AsyncJob>(failedJob);
  }

  getContentLocation(baseUrl: string): string {
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }

    return `${baseUrl}fhir/R4/job/${this.resource.id}/status`;
  }
}

export async function sendAsyncResponse(
  req: Request,
  res: Response,
  callback: ((job: AsyncJob) => Promise<Parameters>) | ((job: AsyncJob) => Promise<void>)
): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { baseUrl } = getConfig();
  const exec = new AsyncJobExecutor(ctx.repo);
  await exec.init(req.protocol + '://' + req.get('host') + req.originalUrl);
  exec.start(callback);
  sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
}
