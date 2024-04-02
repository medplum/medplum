import { ContentType, createReference } from '@medplum/core';
import { ClientApplication, Login } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { createTestClient, createTestProject, withTestContext } from '../test.setup';
import { generateAccessToken, generateSecret } from './keys';

describe('Auth middleware', () => {
  const app = express();
  const systemRepo = getSystemRepo();
  let client: ClientApplication;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Login not found', async () => {
    const accessToken = await generateAccessToken({
      login_id: randomUUID(),
      sub: client.id as string,
      username: client.id as string,
      client_id: client.id as string,
      profile: client.resourceType + '/' + client.id,
      scope: 'openid',
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(401);
  });

  test('Login revoked', async () => {
    const scope = 'openid';

    const login = await withTestContext(() =>
      systemRepo.createResource<Login>({
        resourceType: 'Login',
        authMethod: 'client',
        user: createReference(client),
        client: createReference(client),
        authTime: new Date().toISOString(),
        revoked: true,
        scope,
      })
    );

    const accessToken = await generateAccessToken({
      login_id: login.id as string,
      sub: client.id as string,
      username: client.id as string,
      client_id: client.id as string,
      profile: client.resourceType + '/' + client.id,
      scope,
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(401);
  });

  test('No auth header', async () => {
    const res = await request(app).get('/fhir/R4/Patient');
    expect(res.status).toBe(401);
  });

  test('Unrecognized auth header', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'foo');
    expect(res.status).toBe(401);
  });

  test('Unrecognized auth token type', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'foo foo');
    expect(res.status).toBe(401);
  });

  test('Invalid bearer token', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'Bearer foo');
    expect(res.status).toBe(401);
  });

  test('Basic auth empty string', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'Basic ');
    expect(res.status).toBe(401);
  });

  test('Basic auth malformed string', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'Basic foo');
    expect(res.status).toBe(401);
  });

  test('Basic auth empty username', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(':' + client.secret).toString('base64'));
    expect(res.status).toBe(401);
  });

  test('Basic auth empty password', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':').toString('base64'));
    expect(res.status).toBe(401);
  });

  test('Basic auth client not found', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(randomUUID() + ':' + client.secret).toString('base64'));
    expect(res.status).toBe(401);
  });

  test('Basic auth wrong password', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':wrong').toString('base64'));
    expect(res.status).toBe(401);
  });

  test('Basic auth success', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res.status).toBe(200);
  });

  test('Basic auth project', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Given'],
            family: 'Family',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.project).toBeUndefined();
  });

  test('Basic auth project with extended mode', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Given'],
            family: 'Family',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.project).toBeDefined();
  });

  test('Basic auth without project membership', async () => {
    const client = await withTestContext(() =>
      systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        name: 'Client without project membership',
        secret: generateSecret(32),
      })
    );

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res.status).toBe(401);
  });

  test('Basic auth with super admin client', async () => {
    const { client } = await createTestProject({ superAdmin: true, withClient: true });
    const res = await request(app)
      .get('/fhir/R4/Project?_total=accurate')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(1);
  });
});
