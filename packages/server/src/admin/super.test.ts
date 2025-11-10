// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, getReferenceString } from '@medplum/core';
import type { Bot, Login, Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import type { Queue } from 'bullmq';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { getSystemRepo, Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { generateAccessToken } from '../oauth/keys';
import { rebuildR4SearchParameters } from '../seeds/searchparameters';
import { rebuildR4StructureDefinitions } from '../seeds/structuredefinitions';
import { rebuildR4ValueSets } from '../seeds/valuesets';
import { createTestProject, waitForAsyncJob, withTestContext } from '../test.setup';
import type { CronJobData } from '../workers/cron';
import { getCronQueue } from '../workers/cron';
import type { ReindexJobData } from '../workers/reindex';
import { getReindexQueue } from '../workers/reindex';

jest.mock('../seeds/valuesets');
jest.mock('../seeds/structuredefinitions');
jest.mock('../seeds/searchparameters');

const app = express();
let project: Project;
let adminAccessToken: string;
let nonAdminAccessToken: string;

jest.mock('../migrations/data/index', () => {
  return {
    v1: jest.requireMock('../migrations/data/v1'),
    v2: jest.requireMock('../migrations/data/v2'),
    v3: jest.requireMock('../migrations/data/v2'),
  };
});

describe('Super Admin routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({ project } = await createTestProject({ withClient: true, superAdmin: true }));

    const normalProject = await createTestProject();

    const systemRepo = getSystemRepo();

    const practitioner1 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });

    const practitioner2 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });

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
      login_id: login1.id,
      sub: user1.id,
      username: user1.id,
      profile: getReferenceString(practitioner1),
      scope: 'openid',
    });

    nonAdminAccessToken = await generateAccessToken({
      login_id: login2.id,
      sub: user2.id,
      username: user2.id,
      profile: getReferenceString(practitioner2),
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

  test.each([
    ['outdated', undefined, Repository.VERSION - 1],
    ['specific', '0', 0],
    ['all', undefined, undefined],
  ])('Reindex with %s %s', async (reindexType, maxResourceVersion, expectedMaxResourceVersion) => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'PaymentNotice',
        reindexType,
        maxResourceVersion,
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['PaymentNotice'],
        maxResourceVersion: expectedMaxResourceVersion,
      })
    );
  });

  test.each([
    ['foobar', undefined, 'reindexType must be "outdated", "all", or "specific"'],
    ['outdated', '0', 'maxResourceVersion should only be specified when reindexType is "specific"'],
    ['all', '0', 'maxResourceVersion should only be specified when reindexType is "specific"'],
    ['specific', undefined, `maxResourceVersion must be an integer from 0 to ${Repository.VERSION - 1}`],
    ['specific', -1, `maxResourceVersion must be an integer from 0 to ${Repository.VERSION - 1}`],
    ['specific', Repository.VERSION, `maxResourceVersion must be an integer from 0 to ${Repository.VERSION - 1}`],
    ['specific', '1.1', `maxResourceVersion must be an integer from 0 to ${Repository.VERSION - 1}`],
    ['specific', '9999999', `maxResourceVersion must be an integer from 0 to ${Repository.VERSION - 1}`],
  ])('Reindex with invalid args %s %s', async (reindexType, maxResourceVersion, expectedError) => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'PaymentNotice',
        reindexType,
        maxResourceVersion,
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe(expectedError);
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
        reindexType: 'outdated',
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['PaymentNotice', 'MedicinalProductManufactured', 'BiologicallyDerivedProduct'],
      })
    );
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

  describe('/migrations', () => {
    test('Migrate', async () => {
      const res1 = await request(app)
        .get('/admin/super/migrations')
        .set('Authorization', 'Bearer ' + adminAccessToken);

      expect(res1.body).toStrictEqual({
        postDeployMigrations: [1, 2, 3],
        pendingPostDeployMigration: 0,
      });
      expect(res1.status).toStrictEqual(200);
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
      const asyncJob = await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken);

      const expectedQuery = 'VACUUM;';

      expect(asyncJob.output?.parameter?.find((p) => p.name === 'query')?.valueString).toBe(expectedQuery);

      expect(infoSpy).toHaveBeenCalledWith('[Super Admin]: Vacuum completed', {
        durationMs: expect.any(Number),
        vacuum: true,
        analyze: undefined,
        query: expectedQuery,
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
        vacuum: true,
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
        vacuum: true,
        analyze: true,
        query: 'VACUUM ANALYZE "Observation", "Observation_History";',
        tableNames: ['Observation', 'Observation_History'],
      });
      infoSpy.mockRestore();
    });

    test('Vacuum -- Only analyze', async () => {
      const infoSpy = jest.spyOn(globalLogger, 'info');

      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({ tableNames: ['Observation', 'Observation_History'], analyze: true, vacuum: false });

      expect(res1.status).toStrictEqual(202);
      expect(res1.headers['content-location']).toBeDefined();
      await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken);

      expect(infoSpy).toHaveBeenCalledWith('[Super Admin]: Vacuum completed', {
        durationMs: expect.any(Number),
        vacuum: false,
        analyze: true,
        query: 'ANALYZE "Observation", "Observation_History";',
        tableNames: ['Observation', 'Observation_History'],
      });
      infoSpy.mockRestore();
    });

    test('Vacuum -- neither vacuum nor analyze', async () => {
      const res1 = await request(app)
        .post('/admin/super/vacuum')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({ tableNames: ['Observation', 'Observation_History'], analyze: false, vacuum: false });

      expect(res1.status).toStrictEqual(400);
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

  describe('Reload cron', () => {
    test('Happy path', async () => {
      const cronQueue = getCronQueue() as Queue<CronJobData>;
      expect(cronQueue).toBeDefined();

      const res1 = await request(app)
        .post('/fhir/R4/Bot')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .type('json')
        .send({ resourceType: 'Bot', cronString: '*/20 * * * *' } satisfies Bot);

      expect(res1.status).toStrictEqual(201);
      expect(res1.body).toBeDefined();

      const bot = res1.body as Bot & { id: string };

      const obliterateSpy = jest.spyOn(cronQueue, 'obliterate');
      const upsertJobSchedulerSpy = jest.spyOn(cronQueue, 'upsertJobScheduler');

      const res2 = await request(app)
        .post('/admin/super/reloadcron')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json');

      expect(res2.status).toStrictEqual(202);
      expect(res2.headers['content-location']).toBeDefined();
      await waitForAsyncJob(res2.headers['content-location'], app, adminAccessToken);

      expect(obliterateSpy).toHaveBeenCalledWith({ force: true });
      expect(upsertJobSchedulerSpy).toHaveBeenCalledWith(
        bot.id,
        {
          pattern: '*/20 * * * *',
        },
        {
          data: {
            resourceType: bot.resourceType,
            botId: bot.id,
          },
        }
      );
    });
  });
});
