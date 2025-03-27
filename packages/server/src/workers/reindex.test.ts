import { createReference, OperationOutcomeError, parseSearchRequest, preconditionFailed } from '@medplum/core';
import {
  AsyncJob,
  ImmunizationEvaluation,
  Parameters,
  Patient,
  Practitioner,
  Project,
  ResourceType,
  User,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode, getDatabasePool } from '../database';
import { getSystemRepo, Repository } from '../fhir/repo';
import { SelectQuery } from '../fhir/sql';
import { createTestProject, withTestContext } from '../test.setup';
import { addReindexJob, getReindexQueue, prepareReindexJobData, ReindexJob, ReindexJobData } from './reindex';

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
  });

  test('Reindex resource type with empty page', () =>
    withTestContext(async () => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      await addReindexJob(['MedicinalProductManufactured'], asyncJob);
      expect(queue.add).toHaveBeenCalledWith(
        'ReindexJobData',
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['MedicinalProductManufactured'],
          asyncJobId: asyncJob.id,
        })
      );

      const jobData = queue.add.mock.calls[0][1] as ReindexJobData;
      const reindexJob = new ReindexJob();
      const processIterationSpy = jest.spyOn(reindexJob, 'processIteration');
      await reindexJob.execute(jobData);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('completed');
      expect(asyncJob.output).toMatchObject<Partial<Parameters>>({
        parameter: expect.arrayContaining([
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'count', valueInteger: 0 },
              { name: 'resourceType', valueCode: 'MedicinalProductManufactured' },
            ]),
          },
        ]),
      });

      // Just one iteration since it's an empty resource type
      expect(processIterationSpy).toHaveBeenCalledTimes(1);
    }));

  const idSystem = 'http://example.com/mrn';

  test('Multiple iterations when more than one batchSize exist', () =>
    withTestContext(async () => {
      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const mrn = randomUUID();
      const batchSize = 20; // this is based on the minimum _count that allows canUseCursorLinks to be true
      // Create one more resource than the iteration count so two iterations are expected
      for (let i = 0; i < batchSize + 1; i++) {
        await repo.createResource<ImmunizationEvaluation>({
          resourceType: 'ImmunizationEvaluation',
          identifier: [{ system: idSystem, value: mrn }],
          status: 'completed',
          patient: { reference: 'Patient/123' },
          targetDisease: { text: '1234567890' },
          immunizationEvent: { reference: 'Immunization/123' },
          doseStatus: { text: '1234567890' },
        });
      }

      const jobData = prepareReindexJobData(
        ['ImmunizationEvaluation'],
        asyncJob.id,
        parseSearchRequest(`ImmunizationEvaluation?identifier=${idSystem}|${mrn}`)
      );
      const systemRepo = getSystemRepo();
      const reindexJob = new ReindexJob(systemRepo, batchSize);
      jest.spyOn(reindexJob, 'processIteration');
      await reindexJob.execute(jobData);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('completed');
      expect(asyncJob.output).toMatchObject<Partial<Parameters>>({
        parameter: expect.arrayContaining([
          {
            name: 'result',
            part: expect.arrayContaining([
              { name: 'resourceType', valueCode: 'ImmunizationEvaluation' },
              { name: 'count', valueInteger: batchSize + 1 },
            ]),
          },
        ]),
      });

      expect(reindexJob.processIteration).toHaveBeenCalledTimes(2);
      expect(reindexJob.processIteration).toHaveBeenCalledWith(
        systemRepo,
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['ImmunizationEvaluation'],
          cursor: expect.stringContaining('-'),
        })
      );
    }));

  test('Proceeds to next resource type after exhausting initial one', () =>
    withTestContext(async () => {
      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const resourceTypes = ['PaymentNotice', 'MedicinalProductManufactured'] as ResourceType[];
      const jobData = prepareReindexJobData(resourceTypes, asyncJob.id);

      const systemRepo = getSystemRepo();
      const reindexJob = new ReindexJob(systemRepo);
      jest.spyOn(reindexJob, 'processIteration');
      await reindexJob.execute(jobData);

      expect(reindexJob.processIteration).toHaveBeenCalledTimes(2);
      expect(reindexJob.processIteration).toHaveBeenCalledWith(
        systemRepo,
        expect.objectContaining<Partial<ReindexJobData>>({
          resourceTypes: ['MedicinalProductManufactured'],
          count: 0,
        })
      );

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('completed');

      // Expect 4 history entries (newest first):
      // completed (same output)
      // MedicinalProductManufactured finished
      // PaymentNotice finished
      // creation (no output)

      const history = await repo.readHistory<AsyncJob>('AsyncJob', asyncJob.id);
      const outputs = history.entry?.map((entry) => entry.resource?.output?.parameter) ?? [];
      expect(outputs).toHaveLength(4);
      expect(outputs[0]).toStrictEqual(outputs[1]);
      expect(outputs[1]).toEqual([
        {
          name: 'result',
          part: expect.arrayContaining([{ name: 'resourceType', valueCode: 'PaymentNotice' }]),
        },
        {
          name: 'result',
          part: expect.arrayContaining([{ name: 'resourceType', valueCode: 'MedicinalProductManufactured' }]),
        },
      ]);
      expect(outputs[2]).toEqual([
        {
          name: 'result',
          part: expect.arrayContaining([{ name: 'resourceType', valueCode: 'PaymentNotice' }]),
        },
      ]);

      expect(outputs[3]).toBeUndefined();
    }));

  test('Fails job on error', () =>
    withTestContext(async () => {
      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const jobData = prepareReindexJobData(['ValueSet'], asyncJob.id);

      const systemRepo = getSystemRepo();
      const reindexJob = new ReindexJob(systemRepo);
      jest.spyOn(systemRepo, 'search').mockRejectedValueOnce(new Error('Failed to search systemRepo'));
      await expect(reindexJob.execute(jobData)).resolves.toBe('finished');

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('error');
      expect(asyncJob.output?.parameter).toEqual([
        {
          name: 'result',
          part: expect.arrayContaining([
            {
              name: 'resourceType',
              valueCode: 'ValueSet',
            },
            {
              name: 'error',
              valueString: 'Failed to search systemRepo',
            },
          ]),
        },
      ]);
    }));

  test('Continues when one resource type fails and reports error', () =>
    withTestContext(async () => {
      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const resourceTypes: ResourceType[] = [
        'MedicinalProductManufactured',
        'Binary',
        'MedicinalProductContraindication',
      ];

      const jobData = prepareReindexJobData(resourceTypes, asyncJob.id);
      await expect(new ReindexJob().execute(jobData)).resolves.toBe('finished');

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('error');
      expect(asyncJob.output?.parameter).toEqual<Parameters['parameter']>([
        {
          name: 'result',
          part: expect.arrayContaining([
            { name: 'resourceType', valueCode: 'MedicinalProductManufactured' },
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
            { name: 'resourceType', valueCode: 'MedicinalProductContraindication' },
            expect.objectContaining({ name: 'count' }),
            expect.objectContaining({ name: 'elapsedTime' }),
          ]),
        },
      ]);
    }));

  test('Reindex with search filter', () =>
    withTestContext(async () => {
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

      await repo.createResource<Patient>({
        resourceType: 'Patient',
        gender: 'female', // is not 'unknown', so it won't be reindexed
        identifier: [{ system: idSystem, value: mrn }],
      });
      await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        gender: 'unknown',
        identifier: [{ system: idSystem, value: mrn }],
      });

      const resourceTypes = ['Patient', 'Practitioner'] as ResourceType[];
      const searchFilter = parseSearchRequest(`Person?identifier=${idSystem}|${mrn}&gender=unknown`);

      const jobData = prepareReindexJobData(resourceTypes, asyncJob.id, searchFilter);

      await new ReindexJob().execute(jobData);

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('completed');
      expect(asyncJob.output?.parameter).toEqual([
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
      ]);
    }));

  test('Reindex with _lastUpdated filter', () =>
    withTestContext(async () => {
      const idSystem = 'http://example.com/mrn';
      const mrn = randomUUID();

      const systemRepo = getSystemRepo();

      let asyncJob = await systemRepo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      // Create two patients, one with lastUpdated before the filter and one after
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

      const jobData = prepareReindexJobData(resourceTypes, asyncJob.id, searchFilter);
      await new ReindexJob().execute(jobData);

      asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id);
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

  const CURRENT_VERSION = Repository.VERSION;
  const OLDER_VERSION = CURRENT_VERSION - 1;

  test.each([
    [OLDER_VERSION, 1],
    [CURRENT_VERSION, 2],
    [undefined, 2],
  ])('Reindex with maxResourceVersion %s', (maxResourceVersion, expectedCount) =>
    withTestContext(async () => {
      const systemRepo = getSystemRepo();

      let asyncJob = await systemRepo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const idSystem = 'http://example.com/mrn';
      const mrn = randomUUID();

      const outdatedPatient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [{ system: idSystem, value: mrn }],
      });
      const currentPatient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [{ system: idSystem, value: mrn }],
      });

      const client = repo.getDatabaseClient(DatabaseMode.WRITER);
      const getVersionQuery = (id: string[]): SelectQuery =>
        new SelectQuery('Patient').column('id').column('__version').where('id', 'IN', id);
      await client.query('UPDATE "Patient" SET __version = $1 WHERE id = $2', [OLDER_VERSION, outdatedPatient.id]);
      const beforeResults = await getVersionQuery([outdatedPatient.id, currentPatient.id]).execute(client);
      expect(beforeResults).toHaveLength(2);
      expect(beforeResults).toEqual(
        expect.arrayContaining([
          { id: outdatedPatient.id, __version: OLDER_VERSION },
          { id: currentPatient.id, __version: Repository.VERSION },
        ])
      );

      const jobData = prepareReindexJobData(
        ['Patient'],
        asyncJob.id,
        parseSearchRequest(`Patient?identifier=${idSystem}|${mrn}`),
        maxResourceVersion
      );

      await new ReindexJob().execute(jobData);

      const afterResults = await getVersionQuery([outdatedPatient.id, currentPatient.id]).execute(client);
      expect(afterResults).toHaveLength(2);
      expect(afterResults).toEqual(
        expect.arrayContaining([
          { id: outdatedPatient.id, __version: CURRENT_VERSION },
          { id: currentPatient.id, __version: CURRENT_VERSION },
        ])
      );

      asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('completed');
      expect(asyncJob.output).toMatchObject<Parameters>({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'result',
            part: expect.arrayContaining([
              expect.objectContaining({ name: 'resourceType', valueCode: 'Patient' }),
              expect.objectContaining({ name: 'count', valueInteger: expectedCount }),
            ]),
          },
        ],
      });
    })
  );

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

      const jobData = prepareReindexJobData(resourceTypes, asyncJob.id, searchFilter);
      await new ReindexJob().execute(jobData);

      asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id);
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

      user = await systemRepo.readResource<User>('User', user.id);
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

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Detect cancelled AsyncJob when iteration begins', () =>
    withTestContext(async () => {
      let asyncJob = await repo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'cancelled',
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      const jobData = prepareReindexJobData(['MedicinalProductContraindication'], asyncJob.id);
      const result = await new ReindexJob().execute(jobData);
      expect(result).toStrictEqual('interrupted');

      asyncJob = await repo.readResource('AsyncJob', asyncJob.id);
      expect(asyncJob.status).toStrictEqual('cancelled');
      expect(asyncJob.output).toBeUndefined();
    }));

  test('Ensure job reads up-to-date cancellation status from DB', () =>
    withTestContext(async () => {
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

      // Job will start up with the uncancelled version of the resource
      const jobData = prepareReindexJobData(['MedicinalProductContraindication'], originalJob.id);

      // Should be a no-op due to cancellation
      const result = await new ReindexJob().execute(jobData);
      expect(result).toStrictEqual('interrupted');

      const finalJob = await repo.readResource<AsyncJob>('AsyncJob', cancelledJob.id);
      expect(finalJob.status).toStrictEqual('cancelled');
      expect(finalJob.output).toBeUndefined();
    }));

  test('Ensure updates from job do not clobber cancellation status', () =>
    withTestContext(async () => {
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

      // Job will start up with the uncancelled version of the resource
      const jobData = prepareReindexJobData(['MedicinalProductContraindication'], originalJob.id);

      // Should not override the cancellation status
      const result = await new ReindexJob().execute(jobData);
      expect(result).toStrictEqual('interrupted');

      const finalJob = await repo.readResource<AsyncJob>('AsyncJob', originalJob.id);
      expect(finalJob.status).toStrictEqual('cancelled');
      expect(finalJob.output).toBeUndefined();
    }));
});
