import { AsyncJob } from '@medplum/fhirtypes';
import { Repository, systemRepo } from '../../repo';

export class AsyncJobExecutor {
  readonly repo: Repository;
  private resource: AsyncJob | undefined;
  constructor(repo: Repository) {
    this.repo = repo;
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

  async run(callback: () => Promise<any>): Promise<void> {
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }
    await callback();
    await systemRepo.updateResource<AsyncJob>({
      ...this.resource,
      status: 'completed',
      transactionTime: new Date().toISOString(),
    });
  }

  getContentLocation(baseUrl: string): string {
    if (!this.resource) {
      throw new Error('AsyncJob missing');
    }

    return `${baseUrl}fhir/R4/AsyncJob/${this.resource.id}/status`;
  }
}
