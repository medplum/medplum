import { AsyncJob, Parameters, Patient, Practitioner, ResourceType } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { ReindexJobData, addReindexJob, closeReindexWorker, execReindexJob, getReindexQueue } from './reindex';
import { randomUUID } from 'crypto';
import { parseSearchRequest } from '@medplum/core';

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

        await addReindexJob(['ImmunizationEvaluation'], asyncJob);
        expect(queue.add).toHaveBeenCalledWith(
          'ReindexJobData',
          expect.objectContaining<Partial<ReindexJobData>>({
            resourceTypes: ['ImmunizationEvaluation'],
            asyncJob,
          })
        );

        const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
        await execReindexJob(job);

        asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
        expect(asyncJob.status).toEqual('completed');
        expect(asyncJob.output).toMatchObject<Partial<Parameters>>({
          parameter: expect.arrayContaining([
            {
              name: 'result',
              part: expect.arrayContaining([
                { name: 'count', valueInteger: 0 },
                { name: 'resourceType', valueCode: 'ImmunizationEvaluation' },
              ]),
            },
          ]),
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

      await addReindexJob(['ValueSet'], asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ValueSet'],
          asyncJob,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await execReindexJob(job);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ValueSet'],
          asyncJob,
          count: 500,
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toEqual('accepted');
    }));

  test('Proceeds to next resource type after exhausting initial one', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const resourceTypes = [
        'PaymentNotice',
        'MedicinalProductManufactured',
        'BiologicallyDerivedProduct',
      ] as ResourceType[];

      await addReindexJob(resourceTypes, asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['PaymentNotice', 'MedicinalProductManufactured', 'BiologicallyDerivedProduct'],
          asyncJob,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await execReindexJob(job);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['MedicinalProductManufactured', 'BiologicallyDerivedProduct'],
          asyncJob,
          count: 0,
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

      await addReindexJob(['ValueSet'], asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ValueSet'],
          asyncJob,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();

      const err = new Error('Failed to add job to queue!');
      queue.add.mockRejectedValueOnce(err);
      await expect(execReindexJob(job)).resolves.toBe(undefined);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toEqual('error');
    }));

  test('Reindex with search filter', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      const idSystem = 'http://example.com/mrn';
      const mrn = randomUUID();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });
      await repo.createResource<Patient>({
        resourceType: 'Patient',
        gender: 'unknown',
        identifier: [{ system: idSystem, value: mrn }],
      });
      await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        gender: 'unknown',
        identifier: [{ system: idSystem, value: mrn }],
      });

      const resourceTypes = ['Patient', 'Practitioner'] as ResourceType[];
      const searchFilter = parseSearchRequest(`Person?identifier=${idSystem}|${mrn}&gender=unknown`);

      await addReindexJob(resourceTypes, asyncJob, searchFilter);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['Patient', 'Practitioner'],
          asyncJob,
          searchFilter,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await execReindexJob(job);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['Practitioner'],
          asyncJob,
          count: 0,
          searchFilter,
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toEqual('accepted');

      const job2 = { id: 2, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await execReindexJob(job2);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toEqual('completed');
      expect(asyncJob.output).toMatchObject<Parameters>({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'result',
            part: expect.arrayContaining([
              expect.objectContaining({ name: 'resourceType', valueCode: 'Patient' }),
              expect.objectContaining({ name: 'count', valueInteger: 1 }),
            ]),
          },
          {
            name: 'result',
            part: expect.arrayContaining([
              expect.objectContaining({ name: 'resourceType', valueCode: 'Practitioner' }),
              expect.objectContaining({ name: 'count', valueInteger: 1 }),
            ]),
          },
        ],
      });
    }));
});
