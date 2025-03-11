import { OperationOutcomeError, WithId, accepted } from '@medplum/core';
import { UpdateResourceOptions } from '@medplum/fhir-router';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getConfig } from '../../../config/loader';
import { getAuthenticatedContext } from '../../../context';
import { markPendingDataMigrationCompleted } from '../../../database';
import { getLogger } from '../../../logger';
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

    this.run(callback)
      .then(async (output) => {
        log.info('AsyncJob execution completed', {
          name: callback.name,
          asyncJobId: this.resource?.id,
          duration: `${Date.now() - startTime} ms`,
        });
        await this.completeJob(systemRepo, output);
      })
      .catch(async (err) => {
        log.error('AsyncJob execution failed', {
          name: callback.name,
          asyncJobId: this.resource?.id,
          error: err.toString(),
          stack: err.stack,
        });
        await this.failJob(systemRepo, err);
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

  async completeJob(repo: Repository, output?: Parameters): Promise<AsyncJob | undefined> {
    const job = this.resource;
    if (!job) {
      return undefined;
    }
    const updatedJob: AsyncJob = {
      ...job,
      status: 'completed',
      transactionTime: new Date().toISOString(),
      output,
    };
    if (job.type === 'data-migration') {
      await markPendingDataMigrationCompleted(updatedJob);
    }
    return repo.updateResource<AsyncJob>(updatedJob);
  }

  async updateJobProgress(
    repo: Repository,
    output: Parameters,
    options?: UpdateResourceOptions
  ): Promise<WithId<AsyncJob> | undefined> {
    if (!this.resource) {
      return undefined;
    }
    return repo.updateResource<AsyncJob>(
      {
        ...this.resource,
        output,
      },
      options
    );
  }

  async failJob(repo: Repository, err?: Error): Promise<AsyncJob | undefined> {
    if (!this.resource) {
      return undefined;
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
