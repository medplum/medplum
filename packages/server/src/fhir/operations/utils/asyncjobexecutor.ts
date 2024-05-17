import { OperationOutcomeError, accepted } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getConfig } from '../../../config';
import { getAuthenticatedContext, getRequestContext } from '../../../context';
import { sendOutcome } from '../../outcomes';
import { Repository, getSystemRepo } from '../../repo';

export class AsyncJobExecutor {
  readonly repo: Repository;
  private resource: AsyncJob | undefined;
  constructor(repo: Repository, resource?: AsyncJob) {
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
    const ctx = getRequestContext();
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }
    if (this.resource.status !== 'accepted') {
      throw new Error('Job already completed');
    }

    const startTime = Date.now();
    const systemRepo = getSystemRepo();
    ctx.logger.info('Async job starting', { name: callback.name, asyncJobId: this.resource?.id });

    this.run(callback)
      .then(async (output) => {
        ctx.logger.info('Async job completed', {
          name: callback.name,
          asyncJobId: this.resource?.id,
          duration: `${Date.now() - startTime} ms`,
        });
        await this.completeJob(systemRepo, output);
      })
      .catch(async (err) => {
        ctx.logger.error('Async job failed', { name: callback.name, asyncJobId: this.resource?.id, error: err });
        await this.failJob(systemRepo, err);
      })
      .finally(() => {
        this.repo.close();
      });
  }

  /**
   * Conditionally runs the job callback if the AsyncJob resource is in the correct state.
   * @param callback - The callback to execute.
   * @returns (optional) Output encoded as a Parameters resource.
   */
  async run(
    callback: ((job: AsyncJob) => Promise<Parameters>) | ((job: AsyncJob) => Promise<void>)
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
    if (!this.resource) {
      return undefined;
    }
    return repo.updateResource<AsyncJob>({
      ...this.resource,
      status: 'completed',
      transactionTime: new Date().toISOString(),
      output,
    });
  }

  async failJob(repo: Repository, err: Error): Promise<AsyncJob | undefined> {
    if (!this.resource) {
      return undefined;
    }
    return repo.updateResource<AsyncJob>({
      ...this.resource,
      status: 'error',
      transactionTime: new Date().toISOString(),
      output:
        err instanceof OperationOutcomeError
          ? { resourceType: 'Parameters', parameter: [{ name: 'outcome', resource: err.outcome }] }
          : undefined,
    });
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
