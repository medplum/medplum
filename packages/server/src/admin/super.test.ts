import { accepted, allOk, badRequest, createReference, getReferenceString } from '@medplum/core';
import { AsyncJob, Login, Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { AuthenticatedRequestContext, requestContextStore } from '../context';
import * as database from '../database';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { generateAccessToken } from '../oauth/keys';
import { getRedis } from '../redis';
import { rebuildR4SearchParameters } from '../seeds/searchparameters';
import { rebuildR4StructureDefinitions } from '../seeds/structuredefinitions';
import { rebuildR4ValueSets } from '../seeds/valuesets';
import { createTestProject, waitForAsyncJob, withTestContext } from '../test.setup';
import { getReindexQueue, ReindexJob, ReindexJobData } from '../workers/reindex';
import { isValidTableName, UPGRADE_LOCK_KEY } from './super';

jest.mock('../seeds/valuesets');
jest.mock('../seeds/structuredefinitions');
jest.mock('../seeds/searchparameters');

const app = express();
let project: Project;
let adminAccessToken: string;
let nonAdminAccessToken: string;

describe('isValidTableName', () => {
  test('isValidTableName', () => {
    expect(isValidTableName('Observation')).toStrictEqual(true);
    expect(isValidTableName('Observation_History')).toStrictEqual(true);
    expect(isValidTableName('Observation_Token_text_idx_tsv')).toStrictEqual(true);
    expect(isValidTableName('Robert"; DROP TABLE Students;')).toStrictEqual(false);
    expect(isValidTableName('Observation History')).toStrictEqual(false);
  });
});

describe('Super Admin routes', () => {
  let practitioner1: Practitioner;
  let practitioner2: Practitioner;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    requestContextStore.enterWith(AuthenticatedRequestContext.system());
    ({ project } = await createTestProject({ withClient: true, superAdmin: true }));

    const normalProject = await createTestProject();

    const systemRepo = getSystemRepo();

    practitioner1 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });
    practitioner2 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });

    const user1 = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: 'Super',
      lastName: 'Admin',
      email: `super${randomUUID()}@example.com`,
      passwordHash: 'abc',
    });

    const user2 = await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: 'Normal',
      lastName: 'User',
      email: `normal${randomUUID()}@example.com`,
      passwordHash: 'abc',
    });

    const membership1 = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: createReference(project),
      user: createReference(user1),
      profile: createReference(practitioner1),
    });

    const membership2 = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: createReference(normalProject.project),
      user: createReference(user2),
      profile: createReference(practitioner2),
    });

    const login1 = await systemRepo.createResource<Login>({
      resourceType: 'Login',
      authMethod: 'client',
      user: createReference(user1),
      membership: createReference(membership1),
      authTime: new Date().toISOString(),
      scope: 'openid',
    });

    const login2 = await systemRepo.createResource<Login>({
      resourceType: 'Login',
      authMethod: 'client',
      user: createReference(user2),
      membership: createReference(membership2),
      authTime: new Date().toISOString(),
      scope: 'openid',
    });

    adminAccessToken = await generateAccessToken({
      login_id: login1.id as string,
      sub: user1.id as string,
      username: user1.id as string,
      profile: getReferenceString(practitioner1 as Practitioner),
      scope: 'openid',
    });

    nonAdminAccessToken = await generateAccessToken({
      login_id: login2.id as string,
      sub: user2.id as string,
      username: user2.id as string,
      profile: getReferenceString(practitioner2 as Practitioner),
      scope: 'openid',
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Rebuild ValueSetElements require respond-async', async () => {
    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(400);
    expect(res.body?.issue?.[0]?.details?.text).toBe('Operation requires "Prefer: respond-async"');
  });

  test('Rebuild ValueSetElements as super admin with respond-async', async () => {
    (rebuildR4ValueSets as unknown as jest.Mock).mockImplementationOnce((): Promise<any> => {
      return Promise.resolve(true);
    });

    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken);
  });

  test('Rebuild ValueSetElements access denied', async () => {
    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
  });

  test('Rebuild StructureDefinitions require respond-async', async () => {
    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(400);
    expect(res.body.issue[0].details.text).toBe('Operation requires "Prefer: respond-async"');
  });

  test('Rebuild StructureDefinitions as super admin with respond-async', async () => {
    (rebuildR4StructureDefinitions as unknown as jest.Mock).mockImplementationOnce((): Promise<any> => {
      return Promise.resolve(true);
    });

    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken);
  });

  test('Rebuild StructureDefinitions as super admin with respond-async error', async () => {
    const err = new Error('structuredefinitions test error');
    (rebuildR4StructureDefinitions as unknown as jest.Mock).mockImplementationOnce((): Promise<any> => {
      return Promise.reject(err);
    });

    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    const job = await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken);
    expect(job.status).toStrictEqual('error');
  });

  test('Rebuild StructureDefinitions access denied', async () => {
    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
  });

  test('Rebuild SearchParameters require async', async () => {
    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(400);
    expect(res.body.issue[0].details.text).toBe('Operation requires "Prefer: respond-async"');
  });

  test('Rebuild searchparameters as super admin with respond-async', async () => {
    (rebuildR4SearchParameters as unknown as jest.Mock).mockImplementationOnce((): Promise<any> => {
      return Promise.resolve(true);
    });

    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken);
  });

  test('Rebuild searchparameters as super admin with respond-async error', async () => {
    const err = new Error('rebuild searchparameters test error');
    (rebuildR4SearchParameters as unknown as jest.Mock).mockImplementationOnce((): Promise<any> => {
      return Promise.reject(err);
    });

    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    const job = await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken);
    expect(job.status).toStrictEqual('error');
  });

  test('Rebuild SearchParameters access denied', async () => {
    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
  });

  test('Reindex access denied', async () => {
    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({
        resourceType: 'PaymentNotice',
      });

    expect(res.status).toBe(403);
  });

  test('Reindex require async', async () => {
    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        resourceType: 'PaymentNotice',
      });

    expect(res.status).toStrictEqual(400);
    expect(res.body.issue[0].details.text).toBe('Operation requires "Prefer: respond-async"');
  });

  test('Reindex invalid resource type', async () => {
    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        resourceType: 'XYZ',
      });

    expect(res.status).toBe(400);
  });

  test('Reindex with respond-async', async () => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'PaymentNotice',
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['PaymentNotice'],
      })
    );
    await withTestContext(() => new ReindexJob().execute({ data: queue.add.mock.calls[0][1] } as Job));
    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken);
  });

  test('Reindex with multiple resource types', async () => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'PaymentNotice,MedicinalProductManufactured,BiologicallyDerivedProduct',
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['PaymentNotice', 'MedicinalProductManufactured', 'BiologicallyDerivedProduct'],
      })
    );
    let job = { data: queue.add.mock.calls[0][1] } as Job;
    queue.add.mockClear();

    await withTestContext(() => new ReindexJob().execute(job));
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['MedicinalProductManufactured', 'BiologicallyDerivedProduct'],
      })
    );
    job = { data: queue.add.mock.calls[0][1] } as Job;
    queue.add.mockClear();

    await withTestContext(() => new ReindexJob().execute(job));
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['BiologicallyDerivedProduct'],
      })
    );
    job = { data: queue.add.mock.calls[0][1] } as Job;
    queue.add.mockClear();

    await withTestContext(() => new ReindexJob().execute(job));
    expect(queue.add).not.toHaveBeenCalled();

    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken);
  });

  test('Set password access denied', async () => {
    const res = await request(app)
      .post('/admin/super/setpassword')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({
        email: 'alice@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(403);
  });

  test('Set password missing password', async () => {
    const res = await request(app)
      .post('/admin/super/setpassword')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        email: 'alice@example.com',
        password: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid password, must be at least 8 characters');
  });

  test('Set password user not found', async () => {
    const res = await request(app)
      .post('/admin/super/setpassword')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        email: 'user-not-found@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Set password success', async () => {
    const email = `alice${randomUUID()}@example.com`;

    await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email,
        password: 'password!@#',
      })
    );

    const res = await request(app)
      .post('/admin/super/setpassword')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        email,
        password: 'new-password!@#',
      });

    expect(res.status).toBe(200);
  });

  test('Purge access denied', async () => {
    const res = await request(app)
      .post('/admin/super/purge')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({
        resourceType: 'Login',
        before: '2020-01-01',
      });

    expect(res.status).toBe(403);
  });

  test('Purge invalid resource type', async () => {
    const res = await request(app)
      .post('/admin/super/purge')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        resourceType: 'Patient',
        before: '2020-01-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid resource type');
  });

  test('Purge logins success', async () => {
    const res = await request(app)
      .post('/admin/super/purge')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        resourceType: 'Login',
        before: '2020-01-01',
      });

    expect(res.status).toBe(200);
  });

  test('Remove Bot Id from Jobs Queue access denied', async () => {
    const res = await request(app)
      .post('/admin/super/removebotidjobsfromqueue')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({
        botId: 'testBotId',
      });

    expect(res.status).toBe(403);
  });

  test('Remove Bot Id from Jobs Queue success', async () => {
    const res = await request(app)
      .post('/admin/super/removebotidjobsfromqueue')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        botId: 'TestBotId',
      });

    expect(res.status).toBe(200);
  });

  test('Remove Bot Id from Jobs Queue missing bot id', async () => {
    const res = await request(app)
      .post('/admin/super/removebotidjobsfromqueue')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        botId: '',
      });

    expect(res.status).toBe(400);
  });

  test('Rebuild projectId as super admin with respond-async', async () => {
    const res1 = await request(app)
      .post('/admin/super/rebuildprojectid')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res1.status).toStrictEqual(202);
    expect(res1.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken);
  });

  describe('Data migrations', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    describe('Upgrade lock', () => {
      beforeEach(async () => {
        await getRedis().del(UPGRADE_LOCK_KEY);
      });

      test('Can take the lock when no one holds it', async () => {
        const res1 = await request(app)
          .post('/admin/super/upgradelock')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json')
          .send({});

        expect(res1.status).toStrictEqual(200);
        expect(res1.body).toMatchObject(allOk);
      });

      test('Can take the lock if the current user already holds it', async () => {
        await getRedis().set(UPGRADE_LOCK_KEY, getReferenceString(practitioner1));

        const res1 = await request(app)
          .post('/admin/super/upgradelock')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json')
          .send({});

        expect(res1.status).toStrictEqual(200);
        expect(res1.body).toMatchObject(allOk);
      });

      test('Cannot take the lock if the current user does NOT hold it', async () => {
        await getRedis().set(UPGRADE_LOCK_KEY, getReferenceString(practitioner2));

        const res1 = await request(app)
          .post('/admin/super/upgradelock')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json')
          .send({});

        expect(res1.status).toStrictEqual(400);
        expect(res1.body).toMatchObject(
          badRequest('Unable to acquire the exclusive data upgrade lock. Migration already in-progress')
        );
      });

      test('Can release the lock if the current user is already holding it', async () => {
        await getRedis().set(UPGRADE_LOCK_KEY, getReferenceString(practitioner1));

        const res1 = await request(app)
          .delete('/admin/super/upgradelock')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json');

        expect(res1.status).toStrictEqual(200);
        expect(res1.body).toMatchObject(allOk);
      });

      test('Cannot release the lock if the current user does NOT hold it', async () => {
        const res1 = await request(app)
          .delete('/admin/super/upgradelock')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json');

        expect(res1.status).toStrictEqual(400);
        expect(res1.body).toMatchObject(badRequest('Unable to release lock; current user does not hold the lock'));

        await getRedis().set(UPGRADE_LOCK_KEY, getReferenceString(practitioner2));

        const res2 = await request(app)
          .delete('/admin/super/upgradelock')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json');

        expect(res2.status).toStrictEqual(400);
        expect(res2.body).toMatchObject(badRequest('Unable to release lock; current user does not hold the lock'));
      });
    });

    test('Run data migrations -- Already up-to-date', async () => {
      // 0 means no pending migration
      const getPendingDataMigrationSpy = jest.spyOn(database, 'getPendingDataMigration').mockImplementation(() => 0);
      const maybeStartDataMigrationSpy = jest
        .spyOn(database, 'maybeStartDataMigration')
        .mockImplementation(async () => undefined);

      const res1 = await request(app)
        .post('/admin/super/migrate')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({});

      expect(res1.status).toStrictEqual(200);
      expect(res1.headers['content-location']).not.toBeDefined();
      expect(res1.body).toMatchObject(allOk);
      expect(maybeStartDataMigrationSpy).toHaveBeenCalledTimes(1);
      expect(getPendingDataMigrationSpy).toHaveBeenCalledTimes(1);
    });

    test('Run data migrations -- Migrate fn did not run', async () => {
      // We return -1 from `getPendingDataMigration` only when `migrate` didn't run (`config.runMigrations` === false, presumably), which initializes it to 0
      const getPendingDataMigrationSpy = jest.spyOn(database, 'getPendingDataMigration').mockImplementation(() => -1);

      const res1 = await request(app)
        .post('/admin/super/migrate')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({});

      expect(res1.status).toStrictEqual(400);
      expect(res1.headers['content-location']).not.toBeDefined();
      expect(res1.body).toMatchObject(
        badRequest(
          'Cannot run data migration; config.runMigrations may be false and has prevented schema migrations from running'
        )
      );
      expect(getPendingDataMigrationSpy).toHaveBeenCalledTimes(1);
    });

    test('Run data migrations -- Migrations to run or already running', async () => {
      const res1 = await request(app)
        .post('/fhir/R4/AsyncJob')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({
          resourceType: 'AsyncJob',
          status: 'accepted',
          request: 'mock-job',
          requestTime: new Date().toISOString(),
        } satisfies AsyncJob);

      expect(res1.status).toStrictEqual(201);
      expect(res1.body).toBeDefined();

      const asyncJob: AsyncJob = res1.body;

      const maybeStartDataMigrationSpy = jest
        .spyOn(database, 'maybeStartDataMigration')
        .mockImplementation(async () => asyncJob);

      const res2 = await request(app)
        .post('/admin/super/migrate')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({});

      expect(res2.status).toStrictEqual(202);
      expect(res2.headers['content-location']).toBeDefined();

      setTimeout(async () => {
        const exec = new AsyncJobExecutor(getSystemRepo(), asyncJob);
        await exec.completeJob(getSystemRepo());
      }, 250);

      await waitForAsyncJob(res2.headers['content-location'], app, adminAccessToken);
      expect(maybeStartDataMigrationSpy).toHaveBeenCalledTimes(1);
    });

    describe('Data version asserted', () => {
      test('Run data migrations -- invalid dataMigration asserted', async () => {
        const res1 = await request(app)
          .post('/admin/super/migrate')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json')
          .send({ dataMigration: true });

        expect(res1.status).toStrictEqual(400);
        expect(res1.headers['content-location']).not.toBeDefined();
        expect(res1.body).toMatchObject(badRequest('dataMigration must be an integer'));
      });

      test('Run data migrations -- Matching data version', async () => {
        const getPendingDataMigrationSpy = jest.spyOn(database, 'getPendingDataMigration').mockImplementation(() => 1);
        const maybeStartDataMigrationSpy = jest
          .spyOn(database, 'maybeStartDataMigration')
          .mockImplementation(async () => ({
            resourceType: 'AsyncJob',
            status: 'accepted',
            requestTime: new Date().toISOString(),
            request: 'mock-job',
          }));

        const res1 = await request(app)
          .post('/admin/super/migrate')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json')
          .send({ dataMigration: 1 });

        expect(res1.status).toStrictEqual(202);
        expect(res1.headers['content-location']).toBeDefined();
        expect(res1.body).toMatchObject(accepted(res1.headers['content-location']));
        expect(getPendingDataMigrationSpy).toHaveBeenCalledTimes(1);
        expect(maybeStartDataMigrationSpy).toHaveBeenCalledTimes(1);
      });

      test('Run data migrations -- Asserted version is less than or equal to current version', async () => {
        const getPendingDataMigrationSpy = jest.spyOn(database, 'getPendingDataMigration').mockImplementation(() => 0);
        const getCurrentDataVersionSpy = jest.spyOn(database, 'getCurrentDataVersion').mockImplementation(() => 1);
        const maybeStartDataMigrationSpy = jest.spyOn(database, 'maybeStartDataMigration');

        const res1 = await request(app)
          .post('/admin/super/migrate')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json')
          .send({ dataMigration: 1 });

        expect(res1.status).toStrictEqual(200);
        expect(res1.headers['content-location']).not.toBeDefined();
        expect(res1.body).toMatchObject(allOk);
        expect(getPendingDataMigrationSpy).toHaveBeenCalledTimes(1);
        expect(getCurrentDataVersionSpy).toHaveBeenCalledTimes(1);
        expect(maybeStartDataMigrationSpy).not.toHaveBeenCalled();
      });

      test('Run data migrations -- Asserted version is greater than current data version AND not the pending version', async () => {
        const getPendingDataMigrationSpy = jest.spyOn(database, 'getPendingDataMigration').mockImplementation(() => 0);
        const getCurrentDataVersionSpy = jest.spyOn(database, 'getCurrentDataVersion').mockImplementation(() => 1);
        const maybeStartDataMigrationSpy = jest.spyOn(database, 'maybeStartDataMigration');

        const res1 = await request(app)
          .post('/admin/super/migrate')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json')
          .send({ dataMigration: 2 });

        expect(res1.status).toStrictEqual(400);
        expect(res1.headers['content-location']).not.toBeDefined();
        expect(res1.body).toMatchObject(
          badRequest(
            'Data migration assertion failed. Expected pending migration to be migration 2, server has no pending data migration'
          )
        );
        expect(getPendingDataMigrationSpy).toHaveBeenCalledTimes(1);
        expect(getCurrentDataVersionSpy).toHaveBeenCalledTimes(1);
        expect(maybeStartDataMigrationSpy).not.toHaveBeenCalled();

        jest.clearAllMocks();

        getPendingDataMigrationSpy.mockImplementation(() => 1);
        getCurrentDataVersionSpy.mockImplementation(() => 0);

        const res2 = await request(app)
          .post('/admin/super/migrate')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json')
          .send({ dataMigration: 2 });

        expect(res2.status).toStrictEqual(400);
        expect(res2.headers['content-location']).not.toBeDefined();
        expect(res2.body).toMatchObject(
          badRequest(
            'Data migration assertion failed. Expected pending migration to be migration 2, server has current pending data migration 1'
          )
        );
        expect(getPendingDataMigrationSpy).toHaveBeenCalledTimes(1);
        expect(getCurrentDataVersionSpy).toHaveBeenCalledTimes(1);
        expect(maybeStartDataMigrationSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Table settings', () => {
    test('Set table auto-vacuum settings -- Happy path', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ tableName: 'Observation', settings: { autovacuum_analyze_scale_factor: 0.005 } });

      expect(res1.status).toStrictEqual(200);
      expect(res1.body).toMatchObject(allOk);

      expect(infoSpy).toHaveBeenCalledWith('[Super Admin]: Table settings updated', {
        durationMs: expect.any(Number),
        query: 'ALTER TABLE "Observation" SET (autovacuum_analyze_scale_factor = 0.005);',
        settings: { autovacuum_analyze_scale_factor: 0.005 },
        tableName: 'Observation',
      });

      infoSpy.mockRestore();
    });

    test('No table name', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ settings: { autovacuum_analyze_scale_factor: 0.005 } });

      expect(res1.status).toStrictEqual(400);
      expect(res1.body).toMatchObject(badRequest('Table name must be a string'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('No settings', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ tableName: 'Observation' });

      expect(res1.status).toStrictEqual(400);
      expect(res1.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            code: 'invalid',
            details: {
              text: 'Settings must be object mapping valid table settings to desired values',
            },
            expression: ['settings'],
            severity: 'error',
          },
          {
            code: 'invalid',
            details: {
              text: 'Cannot convert undefined or null to object',
            },
            expression: ['settings'],
            severity: 'error',
          },
        ],
      });

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Invalid setting', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ tableName: 'Observation', settings: { autovacuum_analyze_scale: 0.005 } });

      expect(res1.status).toStrictEqual(400);
      expect(res1.body).toMatchObject({
        resourceType: 'OperationOutcome',
        issue: [
          {
            code: 'invalid',
            details: {
              text: 'autovacuum_analyze_scale is not a valid table setting',
            },
            expression: ['settings'],
            severity: 'error',
          },
        ],
      });

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Settings with int values reject floats', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ tableName: 'Observation', settings: { autovacuum_analyze_threshold: 0.005 } });

      expect(res1.status).toStrictEqual(400);
      expect(res1.body).toMatchObject(badRequest('settings.autovacuum_analyze_threshold must be an integer value'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Settings with float values reject non-numeric values', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ tableName: 'Observation', settings: { autovacuum_analyze_scale_factor: 'testing' } });

      expect(res1.status).toStrictEqual(400);
      expect(res1.body).toMatchObject(badRequest('settings.autovacuum_analyze_scale_factor must be a float value'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Multiple settings', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({
          tableName: 'Observation',
          settings: { autovacuum_analyze_scale_factor: 0.005, autovacuum_vacuum_scale_factor: 0.01 },
        });

      expect(res1.status).toStrictEqual(200);
      expect(res1.body).toMatchObject(allOk);

      expect(infoSpy).toHaveBeenCalledWith('[Super Admin]: Table settings updated', {
        durationMs: expect.any(Number),
        query:
          'ALTER TABLE "Observation" SET (autovacuum_analyze_scale_factor = 0.005, autovacuum_vacuum_scale_factor = 0.01);',
        settings: { autovacuum_analyze_scale_factor: 0.005, autovacuum_vacuum_scale_factor: 0.01 },
        tableName: 'Observation',
      });
      infoSpy.mockRestore();
    });

    test('Multiple settings w/ invalid settings', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({
          tableName: 'Observation',
          settings: { autovacuum_analyze_scale_factor: 0.005, autovacuum_vacuum_scale: 0.01 },
        });

      expect(res1.status).toStrictEqual(400);
      expect(res1.body).toMatchObject(badRequest('autovacuum_vacuum_scale is not a valid table setting'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });
  });

  describe('Vacuum', () => {
    test('Vacuum -- No tables specified', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json');

      expect(res1.status).toStrictEqual(202);
      expect(res1.headers['content-location']).toBeDefined();
      await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken);

      expect(infoSpy).toHaveBeenCalledWith('[Super Admin]: Vacuum completed', {
        durationMs: expect.any(Number),
        analyze: undefined,
        query: 'VACUUM;',
        tableNames: undefined,
      });
      infoSpy.mockRestore();
    });

    test('Invalid table name', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/tablesettings')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ tableName: 'Observation History', settings: { autovacuum_analyze_scale_factor: 0.005 } });

      expect(res1.status).toStrictEqual(400);
      expect(res1.body).toMatchObject(badRequest('Table name must be a snake_cased_string'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Vacuum -- Table names listed', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({ tableNames: ['Observation', 'Observation_History'] });

      expect(res1.status).toStrictEqual(202);
      expect(res1.headers['content-location']).toBeDefined();
      await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken);

      expect(infoSpy).toHaveBeenCalledWith('[Super Admin]: Vacuum completed', {
        durationMs: expect.any(Number),
        analyze: undefined,
        query: 'VACUUM "Observation", "Observation_History";',
        tableNames: ['Observation', 'Observation_History'],
      });
      infoSpy.mockRestore();
    });

    test('Vacuum -- Analyze too', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({ tableNames: ['Observation', 'Observation_History'], analyze: true });

      expect(res1.status).toStrictEqual(202);
      expect(res1.headers['content-location']).toBeDefined();
      await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken);

      expect(infoSpy).toHaveBeenCalledWith('[Super Admin]: Vacuum completed', {
        durationMs: expect.any(Number),
        analyze: true,
        query: 'VACUUM ANALYZE "Observation", "Observation_History";',
        tableNames: ['Observation', 'Observation_History'],
      });
      infoSpy.mockRestore();
    });

    test('Vacuum -- Non-string table names', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({ tableNames: ['Observation', 123] });

      expect(res1.status).toStrictEqual(400);
      expect(res1.headers['content-location']).not.toBeDefined();
      expect(res1.body).toMatchObject(badRequest('Table name(s) must be a string'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Vacuum -- Non-snake-cased table names', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({ tableNames: ['Observation', 'Observation History'] });

      expect(res1.status).toStrictEqual(400);
      expect(res1.headers['content-location']).not.toBeDefined();
      expect(res1.body).toMatchObject(badRequest('Table name(s) must be a snake_cased_string'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Vacuum -- Invalid parameter name', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({ tableName: ['Observation', 123] }); // should be tableNames

      expect(res1.status).toStrictEqual(400);
      expect(res1.headers['content-location']).not.toBeDefined();
      expect(res1.body).toMatchObject(badRequest('Unknown field(s)'));

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    test('Vacuum -- no prefer respond-async', async () => {
      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json');

      expect(res1.status).toStrictEqual(400);
      expect(res1.headers['content-location']).not.toBeDefined();
      expect(res1.body).toMatchObject(badRequest('Operation requires "Prefer: respond-async"'));
    });
  });
});
