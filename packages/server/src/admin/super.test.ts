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
import { Repository } from '../fhir/repo';
import { minCursorBasedSearchPageSize } from '../fhir/search';
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

const mockPgMaintenanceQueries: string[] = [];

jest.mock('pg', () => {
  const original = jest.requireActual('pg');

  function mockGetSql(query: unknown): string | undefined {
    if (typeof query === 'string') {
      return query.trim();
    }
    if (query && typeof query === 'object' && 'text' in query && typeof query.text === 'string') {
      return query.text.trim();
    }
    return undefined;
  }

  function mockIsMaintenanceQuery(sql: string): boolean {
    return (
      sql === 'VACUUM;' ||
      sql.startsWith('VACUUM ') ||
      sql.startsWith('ANALYZE ') ||
      /^ALTER TABLE "[A-Za-z][A-Za-z0-9_]*" SET \(autovacuum_/.test(sql)
    );
  }

  function mockHandleMaintenanceQuery(args: unknown[]): { handled: true; result: unknown } | undefined {
    const sql = mockGetSql(args[0]);
    if (!sql || !mockIsMaintenanceQuery(sql)) {
      return undefined;
    }

    mockPgMaintenanceQueries.push(sql);

    const result = {
      command: sql.split(/\s+/)[0],
      fields: [],
      oid: null,
      rowCount: 0,
      rows: [],
    };
    const callback = args[args.length - 1];
    if (typeof callback === 'function') {
      callback(undefined, result);
      return { handled: true, result: undefined };
    }
    return { handled: true, result: Promise.resolve(result) };
  }

  function mockWrapClient(client: any): any {
    if (client.__mockMaintenanceQueryWrapped) {
      return client;
    }

    const originalQuery = client.query.bind(client);
    client.query = (...queryArgs: any[]): any => {
      const handled = mockHandleMaintenanceQuery(queryArgs);
      if (handled) {
        return handled.result;
      }
      return originalQuery(...queryArgs);
    };
    Object.defineProperty(client, '__mockMaintenanceQueryWrapped', { value: true });
    return client;
  }

  class MockPool extends original.Pool {
    query(...args: any[]): any {
      const handled = mockHandleMaintenanceQuery(args);
      if (handled) {
        return handled.result;
      }
      return original.Pool.prototype.query.apply(this, args);
    }

    connect(...args: any[]): any {
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        return original.Pool.prototype.connect.apply(this, [
          ...args.slice(0, -1),
          (err: unknown, client: any, done: unknown) => {
            if (client) {
              mockWrapClient(client);
            }
            callback(err, client, done);
          },
        ]);
      }

      return original.Pool.prototype.connect.apply(this, args).then((client: any) => mockWrapClient(client));
    }
  }

  return {
    ...original,
    Pool: MockPool,
  };
});

jest.mock('../seeds/valuesets');
jest.mock('../seeds/structuredefinitions');
jest.mock('../seeds/searchparameters');

const app = express();
let project: Project;
let adminAccessToken: string;
let nonAdminAccessToken: string;
const mockAsyncJobWaitOptions = { completionDelayMs: 0, maxAttempts: 200, pollIntervalMs: 10 };
const mockRebuildR4ValueSets = rebuildR4ValueSets as jest.MockedFunction<typeof rebuildR4ValueSets>;
const mockRebuildR4StructureDefinitions = rebuildR4StructureDefinitions as jest.MockedFunction<
  typeof rebuildR4StructureDefinitions
>;
const mockRebuildR4SearchParameters = rebuildR4SearchParameters as jest.MockedFunction<
  typeof rebuildR4SearchParameters
>;

jest.mock('../migrations/data/index', () => {
  return {
    v1: jest.requireMock('../migrations/data/v1'),
    v2: jest.requireMock('../migrations/data/v2'),
    v3: jest.requireMock('../migrations/data/v2'),
  };
});

describe('Super Admin routes', () => {
  let processStdoutWriteSpy: jest.SpyInstance;
  beforeAll(async () => {
    processStdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const config = await loadTestConfig();
    await initApp(app, config);

    let repo: Repository;
    ({ project, repo } = await createTestProject({ withClient: true, superAdmin: true, withRepo: true }));

    const normalProject = await createTestProject();

    const systemRepo = repo.getSystemRepo();

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
    processStdoutWriteSpy.mockRestore();
  });

  beforeEach(() => {
    mockPgMaintenanceQueries.length = 0;
    mockRebuildR4ValueSets.mockReset();
    mockRebuildR4StructureDefinitions.mockReset();
    mockRebuildR4SearchParameters.mockReset();
    mockRebuildR4ValueSets.mockResolvedValue(undefined);
    mockRebuildR4StructureDefinitions.mockResolvedValue(undefined);
    mockRebuildR4SearchParameters.mockResolvedValue(undefined);
  });

  test('Rebuild ValueSetElements require respond-async', async () => {
    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(400);
    expect(res.body?.issue?.[0]?.details?.text).toBe('Operation requires "Prefer: respond-async"');
    expect(mockRebuildR4ValueSets).not.toHaveBeenCalled();
  });

  test('Rebuild ValueSetElements as super admin with respond-async', async () => {
    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);
    expect(mockRebuildR4ValueSets).toHaveBeenCalledTimes(1);
    expect(mockRebuildR4ValueSets).toHaveBeenCalledWith(expect.any(Repository));
  });

  test('Rebuild ValueSetElements access denied', async () => {
    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
    expect(mockRebuildR4ValueSets).not.toHaveBeenCalled();
  });

  test('Rebuild StructureDefinitions require respond-async', async () => {
    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(400);
    expect(res.body.issue[0].details.text).toBe('Operation requires "Prefer: respond-async"');
    expect(mockRebuildR4StructureDefinitions).not.toHaveBeenCalled();
  });

  test('Rebuild StructureDefinitions as super admin with respond-async', async () => {
    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);
    expect(mockRebuildR4StructureDefinitions).toHaveBeenCalledTimes(1);
    expect(mockRebuildR4StructureDefinitions).toHaveBeenCalledWith(expect.any(Repository));
  });

  test('Rebuild StructureDefinitions as super admin with respond-async error', async () => {
    const err = new Error('structuredefinitions test error');
    mockRebuildR4StructureDefinitions.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    const job = await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);
    expect(job.status).toStrictEqual('error');
    expect(mockRebuildR4StructureDefinitions).toHaveBeenCalledTimes(1);
    expect(mockRebuildR4StructureDefinitions).toHaveBeenCalledWith(expect.any(Repository));
  });

  test('Rebuild StructureDefinitions access denied', async () => {
    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
    expect(mockRebuildR4StructureDefinitions).not.toHaveBeenCalled();
  });

  test('Rebuild SearchParameters require async', async () => {
    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(400);
    expect(res.body.issue[0].details.text).toBe('Operation requires "Prefer: respond-async"');
    expect(mockRebuildR4SearchParameters).not.toHaveBeenCalled();
  });

  test('Rebuild searchparameters as super admin with respond-async', async () => {
    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);
    expect(mockRebuildR4SearchParameters).toHaveBeenCalledTimes(1);
    expect(mockRebuildR4SearchParameters).toHaveBeenCalledWith(expect.any(Repository));
  });

  test('Rebuild searchparameters as super admin with respond-async error', async () => {
    const err = new Error('rebuild searchparameters test error');
    mockRebuildR4SearchParameters.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({});

    expect(res.status).toStrictEqual(202);
    const job = await waitForAsyncJob(res.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);
    expect(job.status).toStrictEqual('error');
    expect(mockRebuildR4SearchParameters).toHaveBeenCalledTimes(1);
    expect(mockRebuildR4SearchParameters).toHaveBeenCalledWith(expect.any(Repository));
  });

  test('Rebuild SearchParameters access denied', async () => {
    const res = await request(app)
      .post('/admin/super/searchparameters')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
    expect(mockRebuildR4SearchParameters).not.toHaveBeenCalled();
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

  test('Reindex with all optional opts parameters provided', async () => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'Patient',
        reindexType: 'outdated',
        batchSize: 100,
        searchStatementTimeout: 5000,
        upsertStatementTimeout: 10000,
        delayBetweenBatches: 500,
        progressLogThreshold: 1000,
        endTimestampBufferMinutes: 10,
        maxIterationAttempts: 5,
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['Patient'],
        batchSize: 100,
        searchStatementTimeout: 5000,
        upsertStatementTimeout: 10000,
        delayBetweenBatches: 500,
        progressLogThreshold: 1000,
        maxIterationAttempts: 5,
      })
    );
  });

  test('Reindex with no optional opts parameters (all undefined)', async () => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'Patient',
        reindexType: 'outdated',
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['Patient'],
        batchSize: undefined,
        searchStatementTimeout: undefined,
        upsertStatementTimeout: undefined,
        delayBetweenBatches: undefined,
        progressLogThreshold: undefined,
        maxIterationAttempts: undefined,
      })
    );
  });

  test('Reindex with partial opts parameters', async () => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'Patient',
        reindexType: 'outdated',
        batchSize: 250,
        delayBetweenBatches: 1000,
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['Patient'],
        batchSize: 250,
        searchStatementTimeout: undefined,
        upsertStatementTimeout: undefined,
        delayBetweenBatches: 1000,
        progressLogThreshold: undefined,
        maxIterationAttempts: undefined,
      })
    );
  });

  test.each([
    ['batchSize', 0, 'batchSize must be an integer from 20 to 1000'],
    ['batchSize', 1001, 'batchSize must be an integer from 20 to 1000'],
    ['batchSize', 1.5, 'batchSize must be an integer from 20 to 1000'],
    ['searchStatementTimeout', 999, 'searchStatementTimeout must be at least 1000 milliseconds'],
    ['searchStatementTimeout', 500, 'searchStatementTimeout must be at least 1000 milliseconds'],
    ['upsertStatementTimeout', 999, 'upsertStatementTimeout must be at least 1000 milliseconds'],
    ['upsertStatementTimeout', 0, 'upsertStatementTimeout must be at least 1000 milliseconds'],
    ['delayBetweenBatches', -1, 'delayBetweenBatches must be an integer from 0 to 60000 milliseconds'],
    ['delayBetweenBatches', 60001, 'delayBetweenBatches must be an integer from 0 to 60000 milliseconds'],
    ['progressLogThreshold', 0, 'progressLogThreshold must be a positive integer'],
    ['progressLogThreshold', -1, 'progressLogThreshold must be a positive integer'],
    ['endTimestampBufferMinutes', 0, 'endTimestampBufferMinutes must be a positive integer'],
    ['endTimestampBufferMinutes', -5, 'endTimestampBufferMinutes must be a positive integer'],
    ['maxIterationAttempts', 0, 'maxIterationAttempts must be an integer from 1 to 20'],
    ['maxIterationAttempts', 21, 'maxIterationAttempts must be an integer from 1 to 20'],
    ['maxIterationAttempts', -1, 'maxIterationAttempts must be an integer from 1 to 20'],
  ])('Reindex with invalid %s value %s', async (paramName, paramValue, expectedError) => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'Patient',
        reindexType: 'outdated',
        [paramName]: paramValue,
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe(expectedError);
    expect(queue.add).not.toHaveBeenCalled();
  });

  test.each([
    ['batchSize', minCursorBasedSearchPageSize],
    ['batchSize', 1000],
    ['searchStatementTimeout', 1000],
    ['searchStatementTimeout', 3600000],
    ['upsertStatementTimeout', 1000],
    ['upsertStatementTimeout', 60000],
    ['delayBetweenBatches', 1],
    ['delayBetweenBatches', 60000],
    ['progressLogThreshold', 1],
    ['progressLogThreshold', 100000],
    ['maxIterationAttempts', 1],
    ['maxIterationAttempts', 20],
  ])('Reindex with valid %s boundary value %s', async (paramName, paramValue) => {
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'Patient',
        reindexType: 'outdated',
        [paramName]: paramValue,
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['Patient'],
        [paramName]: paramValue,
      })
    );
  });

  test('Reindex with delayBetweenBatches=0 results in undefined (falsy value)', async () => {
    // Note: delayBetweenBatches=0 becomes undefined due to truthy check in the opts construction
    const queue = getReindexQueue() as any;
    queue.add.mockClear();

    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Prefer', 'respond-async')
      .type('json')
      .send({
        resourceType: 'Patient',
        reindexType: 'outdated',
        delayBetweenBatches: 0,
      });

    expect(res.status).toStrictEqual(202);
    expect(res.headers['content-location']).toBeDefined();
    expect(queue.add).toHaveBeenCalledWith(
      'ReindexJobData',
      expect.objectContaining<Partial<ReindexJobData>>({
        resourceTypes: ['Patient'],
        delayBetweenBatches: undefined,
      })
    );
  });

  test.each([
    [1, 1],
    [10, 10],
    [60, 60],
  ])(
    'Reindex with endTimestampBufferMinutes=%s affects endTimestamp calculation',
    async (endTimestampBufferMinutes, expectedMinutesOffset) => {
      const queue = getReindexQueue() as any;
      queue.add.mockClear();

      const beforeTime = Date.now();

      const res = await request(app)
        .post('/admin/super/reindex')
        .set('Authorization', 'Bearer ' + adminAccessToken)
        .set('Prefer', 'respond-async')
        .type('json')
        .send({
          resourceType: 'Patient',
          reindexType: 'outdated',
          endTimestampBufferMinutes,
        });

      const afterTime = Date.now();

      expect(res.status).toStrictEqual(202);
      expect(res.headers['content-location']).toBeDefined();

      // endTimestampBufferMinutes is consumed to calculate endTimestamp, not stored directly
      const jobData = queue.add.mock.calls[0][1] as ReindexJobData;
      expect(jobData.resourceTypes).toEqual(['Patient']);

      const endTimestamp = new Date(jobData.endTimestamp).getTime();
      const expectedMinTime = beforeTime + expectedMinutesOffset * 60 * 1000;
      const expectedMaxTime = afterTime + expectedMinutesOffset * 60 * 1000;

      expect(endTimestamp).toBeGreaterThanOrEqual(expectedMinTime);
      expect(endTimestamp).toBeLessThanOrEqual(expectedMaxTime);
    }
  );

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

      expect(mockPgMaintenanceQueries).toContain(
        'ALTER TABLE "Observation" SET (autovacuum_analyze_scale_factor = 0.005);'
      );
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

      expect(mockPgMaintenanceQueries).toContain(
        'ALTER TABLE "Observation" SET (autovacuum_analyze_scale_factor = 0.005, autovacuum_vacuum_scale_factor = 0.01);'
      );
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
      const asyncJob = await waitForAsyncJob(
        res1.headers['content-location'],
        app,
        adminAccessToken,
        mockAsyncJobWaitOptions
      );

      const expectedQuery = 'VACUUM;';

      expect(asyncJob.output?.parameter?.find((p) => p.name === 'query')?.valueString).toBe(expectedQuery);

      expect(mockPgMaintenanceQueries).toContain(expectedQuery);
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
      await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);

      expect(mockPgMaintenanceQueries).toContain('VACUUM "Observation", "Observation_History";');
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
      await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);

      expect(mockPgMaintenanceQueries).toContain('VACUUM ANALYZE "Observation", "Observation_History";');
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
      await waitForAsyncJob(res1.headers['content-location'], app, adminAccessToken, mockAsyncJobWaitOptions);

      expect(mockPgMaintenanceQueries).toContain('ANALYZE "Observation", "Observation_History";');
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
