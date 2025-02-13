import {
  AsyncJob,
  Parameters,
  ParametersParameter,
  Patient,
  Practitioner,
  Project,
  ResourceType,
  User,
} from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getSystemRepo, Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { ReindexJob, ReindexJobData, addReindexJob, closeReindexWorker, getReindexQueue } from './reindex';
import { randomUUID } from 'crypto';
import { createReference, OperationOutcomeError, parseSearchRequest, preconditionFailed } from '@medplum/core';
import { SelectQuery } from '../fhir/sql';
import { DatabaseMode, getDatabasePool } from '../database';

describe('Reindex Worker', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
    await closeReindexWorker(); // Double close to ensure quiet ignore
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
        await new ReindexJob().execute(job);

        asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
        expect(asyncJob.status).toStrictEqual('completed');
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

      let job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await new ReindexJob().execute(job);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ValueSet'],
          cursor: expect.stringContaining('-'),
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('accepted');

      job = { id: 2, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();

      await expect(new ReindexJob().execute(job)).resolves.toBe(undefined);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ValueSet'],
          cursor: expect.stringContaining('-'),
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('accepted');
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
      await new ReindexJob().execute(job);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['MedicinalProductManufactured', 'BiologicallyDerivedProduct'],
          count: 0,
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('accepted');
    }));

  test('Updates in-progress status on AsyncJob resource', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const resourceTypes = ['MedicinalProductManufactured', 'BiologicallyDerivedProduct'] as ResourceType[];

      await addReindexJob(resourceTypes, asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes,
          asyncJob,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await new ReindexJob().execute(job);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('accepted');
      const outputParam = asyncJob.output?.parameter?.[0];
      expect(outputParam).toMatchObject<ParametersParameter>({
        name: 'result',
        part: expect.arrayContaining([{ name: 'resourceType', valueCode: 'MedicinalProductManufactured' }]),
      });
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
      await expect(new ReindexJob().execute(job)).resolves.toBe(undefined);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('error');
    }));

  test('Continues when one resource type fails and reports error', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const resourceTypes: ResourceType[] = ['Condition', 'Binary', 'DiagnosticReport'];
      await addReindexJob(resourceTypes, asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes,
          asyncJob,
        })
      );

      let job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();

      await expect(new ReindexJob().execute(job)).resolves.toBe(undefined);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('accepted');
      expect(asyncJob.output).toMatchObject<Partial<Parameters>>({
        parameter: [
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'resourceType', valueCode: 'Condition' },
              expect.objectContaining({ name: 'count' }),
              expect.objectContaining({ name: 'elapsedTime' }),
            ]),
          },
        ],
      });

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['Binary', 'DiagnosticReport'],
          cursor: undefined,
          count: 0,
        })
      );
      job = { id: 2, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();

      await expect(new ReindexJob().execute(job)).resolves.toBe(undefined);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('accepted');
      expect(asyncJob.output).toEqual<Parameters>({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining([
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'resourceType', valueCode: 'Condition' },
              expect.objectContaining({ name: 'count' }),
              expect.objectContaining({ name: 'elapsedTime' }),
            ]),
          },
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'resourceType', valueCode: 'Binary' },
              { name: 'error', valueString: 'Cannot search on Binary resource type' },
              { name: 'nextTimestamp', valueDateTime: '1970-01-01T00:00:00.000Z' },
            ]),
          },
        ]),
      });

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['DiagnosticReport'],
          cursor: undefined,
          count: 0,
        })
      );
      job = { id: 3, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();

      await expect(new ReindexJob().execute(job)).resolves.toBe(undefined);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('error');
      expect(asyncJob.output).toEqual<Parameters>({
        resourceType: 'Parameters',
        parameter: expect.arrayContaining([
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'resourceType', valueCode: 'Condition' },
              expect.objectContaining({ name: 'count' }),
              expect.objectContaining({ name: 'elapsedTime' }),
            ]),
          },
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'resourceType', valueCode: 'Binary' },
              { name: 'error', valueString: 'Cannot search on Binary resource type' },
              { name: 'nextTimestamp', valueDateTime: '1970-01-01T00:00:00.000Z' },
            ]),
          },
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'resourceType', valueCode: 'DiagnosticReport' },
              expect.objectContaining({ name: 'count' }),
              expect.objectContaining({ name: 'elapsedTime' }),
            ]),
          },
        ]),
      });
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
      await new ReindexJob().execute(job);

      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['Practitioner'],
          count: 0,
          searchFilter,
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('accepted');

      const job2 = { id: 2, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await new ReindexJob().execute(job2);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('completed');
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

  test('Reindex with _lastUpdated filter', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      const idSystem = 'http://example.com/mrn';
      const mrn = randomUUID();

      const systemRepo = getSystemRepo();

      let asyncJob = await systemRepo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });
      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { lastUpdated: '1999-12-31T00:00:00Z' },
        identifier: [{ system: idSystem, value: mrn }],
      });
      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { lastUpdated: '2001-12-31T00:00:00Z' },
        identifier: [{ system: idSystem, value: mrn }],
      });

      const resourceTypes = ['Patient'] as ResourceType[];
      const searchFilter = parseSearchRequest(
        `Patient?identifier=${idSystem}|${mrn}&_lastUpdated=gt2000-01-01T00:00:00Z`
      );

      await addReindexJob(resourceTypes, asyncJob, searchFilter);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['Patient'],
          asyncJob,
          searchFilter,
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await new ReindexJob().execute(job);

      asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('completed');
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
        ],
      });
    }));

  test('Populates User.projectId column in database', () =>
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
      const systemRepo = getSystemRepo();
      const project = repo.currentProject() as Project;
      let user = await systemRepo.createResource<User>({
        resourceType: 'User',
        identifier: [{ system: idSystem, value: mrn }],
        firstName: 'Project',
        lastName: 'User',
        project: createReference(project),
      });

      const resourceTypes = ['User'] as ResourceType[];
      const searchFilter = parseSearchRequest(`User?identifier=${idSystem}|${mrn}`);

      await addReindexJob(resourceTypes, asyncJob, searchFilter);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({ resourceTypes, asyncJob, searchFilter })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      queue.add.mockClear();
      await new ReindexJob().execute(job);

      asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('completed');
      expect(asyncJob.output).toMatchObject<Parameters>({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'result',
            part: expect.arrayContaining([
              expect.objectContaining({ name: 'resourceType', valueCode: 'User' }),
              expect.objectContaining({ name: 'count', valueInteger: 1 }),
            ]),
          },
        ],
      });

      user = await systemRepo.readResource<User>('User', user.id as string);
      expect(user.meta?.project).toBeUndefined();

      const rows = await new SelectQuery('User')
        .column('projectId')
        .where('id', '=', user.id)
        .execute(getDatabasePool(DatabaseMode.READER));
      expect(rows[0].projectId).toStrictEqual(project.id);
    }));
});

describe('Job cancellation', () => {
  let repo: Repository;
  const systemRepo = getSystemRepo();
  const jobRunner = new ReindexJob(systemRepo);

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
    await closeReindexWorker(); // Double close to ensure quiet ignore
  });

  test('Detect cancelled AsyncJob when iteration begins', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'cancelled',
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
      await jobRunner.execute(job); // Should be a no-op due to cancellation

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id as string);
      expect(asyncJob.status).toStrictEqual('cancelled');
      expect(asyncJob.output).toBeUndefined();
    }));

  test('Ensure job reads up-to-date cancellation status from DB', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      const originalJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const cancelledJob = await repo.updateResource<AsyncJob>({
        ...originalJob,
        status: 'cancelled',
      });

      await addReindexJob(['ImmunizationEvaluation'], originalJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ImmunizationEvaluation'],
          asyncJob: originalJob, // Job will start up with the uncancelled version of the resource
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await jobRunner.execute(job); // Should be a no-op due to cancellation

      const finalJob = await repo.readResource<AsyncJob>('AsyncJob', cancelledJob.id as string);
      expect(finalJob.status).toStrictEqual('cancelled');
      expect(finalJob.output).toBeUndefined();
    }));

  test('Ensure updates from job do not clobber cancellation status', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      const originalJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const cancelledJob = await repo.updateResource<AsyncJob>({
        ...originalJob,
        status: 'cancelled',
      });

      // Mock repo for the job to return error for version-conditional update
      const error = Promise.reject(new OperationOutcomeError(preconditionFailed));
      await expect(error).rejects.toBeDefined(); // Await promise to ensure it's settled to rejection state
      jest.spyOn(systemRepo, 'updateResource').mockReturnValueOnce(error);
      // Simulate job being cancelled in the middle of the worker execution, after the initial status check
      // but before the job would update the resource itself
      jest
        .spyOn(systemRepo, 'readResource')
        .mockReturnValueOnce(Promise.resolve(originalJob))
        .mockReturnValueOnce(Promise.resolve(cancelledJob));

      await addReindexJob(['ImmunizationEvaluation'], originalJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ImmunizationEvaluation'],
          asyncJob: originalJob, // Job will start up with the uncancelled version of the resource
        })
      );

      const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
      await expect(jobRunner.execute(job)).resolves.toBeUndefined(); // Should not override the cancellation status

      const finalJob = await repo.readResource<AsyncJob>('AsyncJob', originalJob.id as string);
      expect(finalJob.status).toStrictEqual('cancelled');
      expect(finalJob.output).toBeUndefined();
    }));
});
