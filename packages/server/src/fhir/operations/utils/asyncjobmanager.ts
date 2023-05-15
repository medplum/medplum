import { AsyncJob } from '@medplum/fhirtypes';
import { Repository, systemRepo } from '../../repo';

export class AsyncJobManager {
  readonly repo: Repository;
  private resource: AsyncJob | undefined;
  constructor(repo: Repository) {
    this.repo = repo;
  }

  async start(url: string): Promise<AsyncJob> {
    this.resource = await this.repo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'active',
      request: url,
      requestTime: new Date().toISOString(),
    });

    return this.resource;
  }

  async runInBackground(callback: () => Promise<any>): Promise<void> {
    await callback();
    await this.close();
  }

  async close(): Promise<void> {
    if (!this.resource) {
      throw new Error('Async Job must be started before calling close()');
    }

    await systemRepo.updateResource<AsyncJob>({
      ...this.resource,
      status: 'completed',
      transactionTime: new Date().toISOString(),
    });
  }
}
