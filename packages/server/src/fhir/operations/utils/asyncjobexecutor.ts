import { AsyncJob } from '@medplum/fhirtypes';
import { AsyncLocalStorage } from 'async_hooks';
import { getRequestContext } from '../../../context';
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

  async run(callback: () => Promise<any>): Promise<void> {
    callback = AsyncLocalStorage.bind(callback);
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }
    const systemRepo = getSystemRepo();
    try {
      await callback();
      await systemRepo.updateResource<AsyncJob>({
        ...this.resource,
        status: 'completed',
        transactionTime: new Date().toISOString(),
      });
    } catch (err) {
      await systemRepo.updateResource<AsyncJob>({
        ...this.resource,
        status: 'error',
        transactionTime: new Date().toISOString(),
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
