// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, sleep } from '@medplum/core';
import { Bundle, ProjectMembership, UserConfiguration } from '@medplum/fhirtypes';
import express, { Express } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { getRedis } from '../redis';
import { createTestProject, deleteRedisKeys, TestRedisConfig } from '../test.setup';

describe('FHIR Rate Limits', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let redisConfig: TestRedisConfig;
  let accessToken: string;

  beforeAll(async () => {
    config = await loadTestConfig();
    redisConfig = config.redis as TestRedisConfig;
  });

  beforeEach(async () => {
    app = express();
    config.defaultRateLimit = -1;
    redisConfig.db = 6; // Use different temp Redis instance for these tests
    redisConfig.keyPrefix = 'fhir-quota:';
  });

  afterEach(async () => {
    await deleteRedisKeys(getRedis(), redisConfig.keyPrefix);
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Blocks request that would exceed limit', async () => {
    config.defaultFhirQuota = 20;
    await initApp(app, config);
    ({ accessToken } = await createTestProject({ withAccessToken: true }));

    const res = await request(app).get('/fhir/R4/Patient?_count=20').auth(accessToken, { type: 'bearer' }).send();
    expect(res.status).toBe(200);
    expect(res.get('ratelimit')).toStrictEqual('"fhirInteractions";r=0;t=60');

    const res2 = await request(app).get('/fhir/R4/Patient?_count=20').auth(accessToken, { type: 'bearer' }).send();
    expect(res2.status).toBe(429);
    expect(res2.get('ratelimit')).toStrictEqual('"fhirInteractions";r=0;t=60');
  });

  test('Blocks single too-expensive request', async () => {
    config.defaultFhirQuota = 1;
    await initApp(app, config);
    ({ accessToken } = await createTestProject({ withAccessToken: true }));

    const res = await request(app)
      .post('/fhir/R4/Patient')
      .auth(accessToken, { type: 'bearer' })
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(429);
  });

  test('Allows batch under limit', async () => {
    config.defaultFhirQuota = 1;
    await initApp(app, config);
    ({ accessToken } = await createTestProject({ withAccessToken: true }));

    const res = await request(app)
      .post('/fhir/R4/')
      .auth(accessToken, { type: 'bearer' })
      .send({
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{ request: { method: 'GET', url: 'Patient' } }],
      } as Bundle);
    expect(res.status).toBe(200);
  });

  test('Blocks oversized transaction bundle', async () => {
    config.defaultFhirQuota = 1;
    await initApp(app, config);

    ({ accessToken } = await createTestProject({
      withAccessToken: true,
      project: { features: ['transaction-bundles'] },
    }));

    const res = await request(app)
      .post('/fhir/R4/')
      .auth(accessToken, { type: 'bearer' })
      .send({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [{ request: { method: 'GET', url: 'Patient' } }, { request: { method: 'GET', url: 'Practitioner' } }],
      } satisfies Bundle);
    expect(res.status).toBe(429);
  });

  test('Reports multiple, in-progress rate limits', async () => {
    config.defaultFhirQuota = 500;
    config.defaultRateLimit = 100;
    await initApp(app, config);
    ({ accessToken } = await createTestProject({ withAccessToken: true }));

    const res = await request(app).get('/fhir/R4/Patient?_count=20').auth(accessToken, { type: 'bearer' }).send();
    expect(res.status).toBe(200);
    expect(res.get('ratelimit')).toStrictEqual('"requests";r=99;t=60, "fhirInteractions";r=480;t=60');

    await sleep(1000);

    const res2 = await request(app).get('/fhir/R4/Patient?_count=20').auth(accessToken, { type: 'bearer' }).send();
    expect(res2.status).toBe(200);
    expect(res2.get('ratelimit')).toStrictEqual('"requests";r=98;t=59, "fhirInteractions";r=460;t=59');
  });

  test('Respects Project setting override', async () => {
    config.defaultFhirQuota = 1;
    await initApp(app, config);

    ({ accessToken } = await createTestProject({
      withAccessToken: true,
      project: { systemSetting: [{ name: 'userFhirQuota', valueInteger: 1000 }] },
    }));

    const res = await request(app)
      .post('/fhir/R4/Patient')
      .auth(accessToken, { type: 'bearer' })
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
  });

  test('Respects ProjectMembership setting override', async () => {
    config.defaultFhirQuota = 1;
    await initApp(app, config);

    const { accessToken, repo, membership } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      withClient: true,
    });

    const userConfig = await repo.createResource<UserConfiguration>({
      resourceType: 'UserConfiguration',
      option: [{ id: 'fhirQuota', valueInteger: 1000 }],
    });
    await repo.updateResource<ProjectMembership>({
      ...membership,
      userConfiguration: createReference(userConfig),
    });

    const res = await request(app)
      .post('/fhir/R4/Patient')
      .auth(accessToken, { type: 'bearer' })
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
  });

  test('Respects Project level limit', async () => {
    config.defaultFhirQuota = 100;
    await initApp(app, config);

    const { accessToken, project } = await createTestProject({
      withAccessToken: true,
      project: {
        systemSetting: [{ name: 'totalFhirQuota', valueInteger: 100 }],
      },
    });

    const email = `${randomUUID()}@example.com`;
    const password = randomUUID();
    await inviteUser({ project, resourceType: 'Practitioner', firstName: 'A.', lastName: 'Zee', email, password });

    const loginRes = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      scope: 'openid offline',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(loginRes.status).toBe(200);

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: loginRes.body.code,
      code_verifier: 'xyz',
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    const otherToken = tokenRes.body.access_token;

    const res = await request(app)
      .post('/fhir/R4/Patient')
      .auth(accessToken, { type: 'bearer' })
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);

    const res2 = await request(app)
      .post('/fhir/R4/Patient')
      .auth(otherToken, { type: 'bearer' })
      .send({ resourceType: 'Patient' });
    expect(res2.status).toBe(429);
  });
});
