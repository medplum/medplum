import { assertOk, ClientApplication, createReference, Login } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { repo } from '../fhir';
import { initTestClientApplication } from '../jest.setup';
import { initKeys } from '../oauth';
import { generateAccessToken } from './keys';

const app = express();
let client: ClientApplication;

describe('Auth middleware', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await initApp(app);
    await initKeys(config);
    client = await initTestClientApplication();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Success', async () => {
    const scope = 'openid';

    const [loginOutcome, login] = await repo.createResource<Login>({
      resourceType: 'Login',
      client: createReference(client),
      profile: createReference(client),
      authTime: new Date().toISOString(),
      scope
    });

    assertOk(loginOutcome);

    const accessToken = await generateAccessToken({
      login_id: login?.id as string,
      sub: client.id as string,
      username: client.id as string,
      client_id: client.id as string,
      profile: client.resourceType + '/' + client.id,
      scope
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Login not found', async () => {
    const accessToken = await generateAccessToken({
      login_id: randomUUID(),
      sub: client.id as string,
      username: client.id as string,
      client_id: client.id as string,
      profile: client.resourceType + '/' + client.id,
      scope: 'openid'
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(401);
  });

  test('Login revoked', async () => {
    const scope = 'openid';

    const [loginOutcome, login] = await repo.createResource<Login>({
      resourceType: 'Login',
      client: createReference(client),
      profile: createReference(client),
      authTime: new Date().toISOString(),
      revoked: true,
      scope
    });

    assertOk(loginOutcome);

    const accessToken = await generateAccessToken({
      login_id: login?.id as string,
      sub: client.id as string,
      username: client.id as string,
      client_id: client.id as string,
      profile: client.resourceType + '/' + client.id,
      scope
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(401);
  });

  test('No auth header', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient');
    expect(res.status).toBe(401);
  });

  test('Unrecognized auth header', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'foo');
    expect(res.status).toBe(401);
  });

  test('Unrecognized auth token type', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'foo foo');
    expect(res.status).toBe(401);
  });

  test('Invalid bearer token', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer foo');
    expect(res.status).toBe(401);
  });

  test('Basic auth empty string', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ');
    expect(res.status).toBe(401);
  });

  test('Basic auth malformed string', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic foo');
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
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + 'wrong').toString('base64'));
    expect(res.status).toBe(401);
  });

  test('Basic auth success', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res.status).toBe(200);
  });

});
