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
  constructor(repo: Repository) {
    this.repo = repo.clone();
  }

  async init(url: string): Promise<AsyncJob> {
    this.resource = await this.repo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      request: url,
      requestTime: new Date().toISOString(),
    });

    return this.resource;
  }

  start(callback: () => Promise<any>): void {
    const ctx = getRequestContext();
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }

    this.run(callback)
      .then(() => ctx.logger.info('Async job completed', { name: callback.name, asyncJobId: this.resource?.id }))
      .catch((err) =>
        ctx.logger.error('Async job failed', { name: callback.name, asyncJobId: this.resource?.id, error: err })
      );
  }

  async run(callback: (() => Promise<Parameters>) | (() => Promise<void>)): Promise<void> {
    callback = AsyncLocalStorage.bind(callback);
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }
    const systemRepo = getSystemRepo();
    try {
      const output = await callback();
      await systemRepo.updateResource<AsyncJob>({
        ...this.resource,
        status: 'completed',
        transactionTime: new Date().toISOString(),
        output: output ?? undefined,
      });
    } catch (err) {
      await systemRepo.updateResource<AsyncJob>({
        ...this.resource,
        status: 'error',
        transactionTime: new Date().toISOString(),
        output:
          err instanceof OperationOutcomeError
            ? { resourceType: 'Parameters', parameter: [{ name: 'outcome', resource: err.outcome }] }
            : undefined,
      });
      throw err;
    } finally {
      this.repo.close();
    }
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
  callback: (() => Promise<Parameters>) | (() => Promise<void>)
): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { baseUrl } = getConfig();
  const exec = new AsyncJobExecutor(ctx.repo);
  await exec.init(req.protocol + '://' + req.get('host') + req.originalUrl);
  exec.start(callback);
  sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
}
