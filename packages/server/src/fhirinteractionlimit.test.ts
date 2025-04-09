import express, { Express } from 'express';
import { loadTestConfig } from './config/loader';
import { initApp, shutdownApp } from './app';
import { getRedis } from './redis';
import request from 'supertest';
import { createTestProject } from './test.setup';
import { MedplumServerConfig } from './config/types';
import { Bundle } from '@medplum/fhirtypes';
import { sleep } from '@medplum/core';

describe('FHIR Rate Limits', () => {
  let app: Express;
  let config: MedplumServerConfig;
  let accessToken: string;

  beforeAll(async () => {
    config = await loadTestConfig();
  });

  beforeEach(async () => {
    app = express();
    config.defaultRateLimit = -1;
    config.redis.db = 6; // Use different temp Redis instance for these tests
  });

  afterEach(async () => {
    await getRedis().flushdb();
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Blocks request that would exceed limit', async () => {
    config.defaultFhirInteractionLimit = 1;
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
    config.defaultFhirInteractionLimit = 1;
    await initApp(app, config);

    ({ accessToken } = await createTestProject({ withAccessToken: true }));

    const res = await request(app)
      .post('/fhir/R4/Patient')
      .auth(accessToken, { type: 'bearer' })
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(429);
  });

  test('Allows batch under limit', async () => {
    config.defaultFhirInteractionLimit = 1;
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
    config.defaultFhirInteractionLimit = 1;
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
    config.defaultFhirInteractionLimit = 2;
    config.defaultRateLimit = 100;
    await initApp(app, config);

    ({ accessToken } = await createTestProject({ withAccessToken: true }));

    const res = await request(app).get('/fhir/R4/Patient?_count=20').auth(accessToken, { type: 'bearer' }).send();
    expect(res.status).toBe(200);
    expect(res.get('ratelimit')).toStrictEqual('"requests";r=99;t=60, "fhirInteractions";r=1;t=60');

    await sleep(1000);

    const res2 = await request(app).get('/fhir/R4/Patient?_count=20').auth(accessToken, { type: 'bearer' }).send();
    expect(res2.status).toBe(200);
    expect(res2.get('ratelimit')).toStrictEqual('"requests";r=98;t=59, "fhirInteractions";r=0;t=59');
  });
});
