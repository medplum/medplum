import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { ReindexJobData, addReindexJob, closeReindexWorker, execReindexJob, getReindexQueue } from './reindex';

let repo: Repository;

describe('Reindex Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
    await closeReindexWorker(); // Double close to ensure quite ignore
  });

  test('Reindex resource type with empty page', () =>
    withTestContext(
      async () => {
        const queue = getReindexQueue() as any;
        queue.add.mockClear();

        let asyncJob = await repo.createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          status: 'accepted',
          requestTime: new Date().toISOString(),
          request: '/admin/super/reindex',
        });

        await addReindexJob('ImmunizationEvaluation', asyncJob);
        expect(queue.add).toHaveBeenCalledWith(
          'ReindexJobData',
          expect.objectContaining<Partial<ReindexJobData>>({
            resourceType: 'ImmunizationEvaluation',
            asyncJob,
          })
        );

        const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
        await execReindexJob(job);

        asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
        expect(asyncJob.status).toEqual('completed');
        expect(asyncJob.output).toMatchObject<Partial<Parameters>>({
          parameter: expect.arrayContaining([{ name: 'count', valueInteger: 0 }]),
        });
      },
      { traceId: '00-12345678901234567890123456789012-3456789012345678-01' }
    ));

  test('Enqueues next job when more resources need to be indexed', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      await addReindexJob('ValueSet', asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceType: 'ValueSet',
          asyncJob,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await execReindexJob(job);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceType: 'ValueSet',
          asyncJob,
          count: 500,
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toEqual('accepted');
    }));

  test('Fails job on error', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      await addReindexJob('ValueSet', asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceType: 'ValueSet',
          asyncJob,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();

      const err = new Error('Failed to add job to queue!');
      queue.add.mockRejectedValueOnce(err);
      await expect(execReindexJob(job)).rejects.toBe(err);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toEqual('error');
    }));
});
