import { Operator } from '@medplum/core';
import { ClientApplication, Login, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import setCookieParser from 'set-cookie-parser';
import request from 'supertest';
import { URL, URLSearchParams } from 'url';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { setPassword } from '../auth/setpassword';
import { loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { revokeLogin } from './utils';

describe('OAuth Authorize', () => {
  const app = express();
  const systemRepo = getSystemRepo();
  const email = randomUUID() + '@example.com';
  const password = randomUUID();
  let project: Project;
  let client: ClientApplication;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // Create a test project
    ({ project, client } = await createTestProject({ withClient: true }));

    // Create a test user
    const { user } = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      email,
    });

    // Set the test user password
    await setPassword(user, password);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Client not found', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: '123',
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(400);
  });

  test('Wrong redirect', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: 'https://example2.com',
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(400);
  });

  test('Invalid response_type', async () => {
    const params = new URLSearchParams({
      response_type: 'xyz',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toEqual('unsupported_response_type');
  });

  test('Unsupported request', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      request: 'unsupported-request',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toEqual('request_not_supported');
  });

  test('Missing scope', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toEqual('invalid_request');
  });

  test('Missing code_challenge_method', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: '',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toEqual('invalid_request');
  });

  test('Invalid audience', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      aud: 'https://example.com/invalid',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toEqual('invalid_request');
  });

  test('Malformed audience', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      aud: 'x',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toEqual('invalid_request');
  });

  test('Server URL audience', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      aud: 'http://localhost:8103', // Intentionally omit the trailing slash, should still work
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();
  });

  test('FHIR URL audience', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      aud: 'http://localhost:8103/fhir/R4',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();
  });

  test('Success', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
  });

  test('prompt=none and no existing login', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      prompt: 'none',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    const location = new URL(res.headers.location);
    expect(location.host).toBe('example.com');
    expect(location.searchParams.get('error')).toBe('login_required');
  });

  test('prompt=none success', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res1.status).toBe(200);
    expect(res1.body.code).toBeDefined();
    expect(res1.headers['set-cookie']).toBeDefined();

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res1.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.id_token).toBeDefined();

    const cookies = setCookieParser.parse(res1.headers['set-cookie']);
    expect(cookies.length).toBe(1);

    const cookie = cookies[0];

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      prompt: 'none',
    });

    const res3 = await request(app)
      .get('/oauth2/authorize?' + params.toString())
      .set('Cookie', cookie.name + '=' + cookie.value);
    expect(res3.status).toBe(302);
    expect(res3.headers.location).toBeDefined();

    const location = new URL(res3.headers.location);
    expect(location.host).toBe('example.com');
    expect(location.searchParams.get('error')).toBeNull();
  });

  test('Revoked cookie', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res1.status).toBe(200);
    expect(res1.body.code).toBeDefined();
    expect(res1.headers['set-cookie']).toBeDefined();

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res1.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.id_token).toBeDefined();

    const cookies = setCookieParser.parse(res1.headers['set-cookie']);
    expect(cookies.length).toBe(1);

    const cookie = cookies[0];

    await withTestContext(async () =>
      revokeLogin(
        (
          await systemRepo.search({
            resourceType: 'Login',
            filters: [{ code: 'cookie', operator: Operator.EQUALS, value: cookie.value }],
          })
        ).entry?.[0]?.resource as Login
      )
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      prompt: 'none',
    });

    const res3 = await request(app)
      .get('/oauth2/authorize?' + params.toString())
      .set('Cookie', cookie.name + '=' + cookie.value);
    expect(res3.status).toBe(302);
    expect(res3.headers.location).toBeDefined();

    const location = new URL(res3.headers.location);
    expect(location.host).toBe('example.com');
    expect(location.searchParams.get('error')).toBe('login_required');
  });

  test('Using id_token_hint', async () => {
    // 1) Authorize as normal
    // 2) Get tokens
    // 3) Authorize using id_token_hint
    const res1 = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res1.status).toBe(200);
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res1.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.id_token).toBeDefined();

    const params2 = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      id_token_hint: res2.body.id_token,
    });
    const res3 = await request(app).get('/oauth2/authorize?' + params2.toString());
    expect(res3.status).toBe(302);
    expect(res3.headers.location).toBeDefined();

    const location2 = new URL(res3.headers.location);
    expect(location2.host).toBe('example.com');
    expect(location2.searchParams.get('error')).toBeNull();
    expect(location2.searchParams.get('code')).not.toBeNull();
  });

  test('Invalid id_token_hint', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      id_token_hint: 'invalid.jwt.invalid',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();

    const location = new URL(res.headers.location);
    expect(location.host).not.toBe('example.com');
  });

  test('Post success', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });

    const res = await request(app).post('/oauth2/authorize').send(params.toString());
    expect(res.status).toBe(302);

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();
  });

  test('Post client not found', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: '123',
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });

    const res = await request(app).post('/oauth2/authorize').send(params.toString());
    expect(res.status).toBe(400);
  });
});
