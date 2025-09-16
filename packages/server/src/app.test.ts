// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, ContentType, getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import express, { json } from 'express';
import request from 'supertest';
import { inviteUser } from './admin/invite';
import { initApp, JSON_TYPE, shutdownApp } from './app';
import { getConfig, loadTestConfig } from './config/loader';
import { DatabaseMode, getDatabasePool } from './database';
import { globalLogger } from './logger';
import { getRedis } from './redis';
import { createTestProject, initTestAuth } from './test.setup';

describe('App', () => {
  test('Get HTTP config', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Use /api/', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/api/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  test.each<[string, boolean]>([
    [ContentType.JSON, true],
    [ContentType.FHIR_JSON, true],
    [ContentType.JSON_PATCH, true],
    [ContentType.SCIM_JSON, true],
    ['application/cloudevents-batch+json', true],
    ['application/gibberish+json', true],
    ['application/text', false], // not JSON
    ['text/json', false], // legacy mime type
    ['text/x-json', false], // legacy mime type
    ['json/application', false], // invalid
  ])('JSON body parser with %s', async (contentType, shouldParse) => {
    const app = express();
    app.use(json({ type: JSON_TYPE }));
    app.post('/post-me', (req, res) => {
      if (req.body?.toEcho) {
        res.json({ ok: true, echo: req.body?.toEcho });
      } else {
        res.json({ ok: false });
      }
    });

    const res = await request(app)
      .post('/post-me')
      .set('Content-Type', contentType)
      .send(JSON.stringify({ toEcho: 'hai' }));
    if (shouldParse) {
      expect(res.body).toStrictEqual({ ok: true, echo: 'hai' });
    } else {
      expect(res.body).toStrictEqual({ ok: false });
    }
  });

  test('Get HTTPS config', async () => {
    const app = express();
    const config = await loadTestConfig();
    getConfig().baseUrl = 'https://example.com/';
    await initApp(app, config);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  test('robots.txt', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toBe('User-agent: *\nDisallow: /');
    expect(await shutdownApp()).toBeUndefined();
  });

  test('No CORS', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/').set('Origin', 'https://blackhat.xyz');
    expect(res.status).toBe(200);
    expect(res.headers['origin']).toBeUndefined();
    expect(await shutdownApp()).toBeUndefined();
  });

  describe('loggingMiddleware', () => {
    let app: express.Express;
    let originalWrite: any;

    beforeEach(async () => {
      app = express();
      const config = await loadTestConfig();
      config.logLevel = 'info';
      config.logRequests = true;
      originalWrite = process.stdout.write;
      process.stdout.write = jest.fn();
      await initApp(app, config);
    });

    afterEach(async () => {
      await shutdownApp();
      process.stdout.write = originalWrite;
    });

    test('X-Forwarded-For spoofing', async () => {
      const res = await request(app).get('/').set('X-Forwarded-For', '1.1.1.1, 2.2.2.2');
      expect(res.status).toBe(200);
      expect(process.stdout.write).toHaveBeenCalledTimes(1);

      const logLine = (process.stdout.write as jest.Mock).mock.calls[0][0];
      const logObj = JSON.parse(logLine);
      expect(logObj.ip).toBe('2.2.2.2');
    });

    test('Authenticated request with logRequests enabled', async () => {
      const accessToken = await initTestAuth();

      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Simpson', given: ['Lisa'] }],
      };
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(patient);
      expect(res1.status).toBe(201);
      expect(res1.body).toMatchObject(patient);
      expect(process.stdout.write).toHaveBeenCalledTimes(1);

      const calls = (process.stdout.write as jest.Mock).mock.calls;
      const logLine = calls[calls.length - 1][0];
      const logObj = JSON.parse(logLine);
      expect(logObj).toMatchObject({ method: 'POST', path: '/fhir/R4/Patient', status: 201 });
    });

    test('Authenticated request with On-Behalf-Of', async () => {
      const { accessToken, project, client } = await createTestProject({
        withAccessToken: true,
        withClient: true,
        membership: { admin: true },
      });

      const { profile } = await inviteUser({
        project,
        resourceType: 'Practitioner',
        firstName: 'Test',
        lastName: 'Person',
      });

      (process.stdout.write as jest.Mock).mockClear();

      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Simpson', given: ['Lisa'] }],
      };
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum-On-Behalf-Of', getReferenceString(profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(patient);
      expect(res1.status).toBe(201);
      expect(res1.body).toMatchObject(patient);
      expect(process.stdout.write).toHaveBeenCalledTimes(1);

      const logLine = (process.stdout.write as jest.Mock).mock.calls[0][0];
      const logObj = JSON.parse(logLine);
      expect(logObj).toMatchObject({ profile: `${getReferenceString(client)} (as ${getReferenceString(profile)})` });
    });

    test('Logs on middleware error', async () => {
      const accessToken = await initTestAuth();
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(`>kjaysgdfsk;sdfgjsdrg<`); // Send malformed data that will fail in the body parser middleware
      expect(res1.status).toBe(400);
      expect(process.stdout.write).toHaveBeenCalledTimes(1);

      const calls = (process.stdout.write as jest.Mock).mock.calls;
      const logLine = calls[calls.length - 1][0];
      const logObj = JSON.parse(logLine);
      expect(logObj).toMatchObject({ method: 'POST', path: '/fhir/R4/Patient', status: 400 });
    });
  });

  test('Internal Server Error', async () => {
    const app = express();
    app.get('/throw', () => {
      throw new Error('Catastrophe!');
    });
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/throw');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ msg: 'Internal Server Error' });
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Stream is not readable', async () => {
    const app = express();
    app.get('/throw', () => {
      const err = new Error('stream.not.readable');
      (err as any).type = 'stream.not.readable';
      throw err;
    });
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/throw');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('Stream not readable'));
    expect(await shutdownApp()).toBeUndefined();
  });

  test('Database disconnect', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);

    const loggerError = jest.spyOn(globalLogger, 'error').mockReturnValueOnce();
    const error = new Error('Mock database disconnect');
    getDatabasePool(DatabaseMode.WRITER).emit('error', error);
    expect(loggerError).toHaveBeenCalledWith('Database connection error', error);
    expect(await shutdownApp()).toBeUndefined();
  });

  test.skip('Database timeout', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    config.database.queryTimeout = 1;
    await initApp(app, config);
    const res = await request(app)
      .get(`/fhir/R4/SearchParameter?base=Observation`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(400);

    expect(await shutdownApp()).toBeUndefined();
  });

  test.skip('Preflight max age', async () => {
    const app = express();
    const res = await request(app).options('/');
    expect(res.status).toBe(204);
    expect(res.header['access-control-max-age']).toBe('86400');
    expect(res.header['cache-control']).toBe('public, max-age=86400');
  });

  test('Server rate limit', async () => {
    const app = express();
    const config = await loadTestConfig();
    config.defaultRateLimit = 1;
    config.redis.db = 6; // Use different temp Redis instance for this test only
    await initApp(app, config);

    const res = await request(app).get('/api/');
    expect(res.status).toBe(200);
    const res2 = await request(app).get('/api/');
    expect(res2.status).toBe(429);
    await getRedis().flushdb();
    expect(await shutdownApp()).toBeUndefined();
  });
});
