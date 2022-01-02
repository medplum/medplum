import { ClientApplication } from '@medplum/fhirtypes';
import express from 'express';
import setCookieParser from 'set-cookie-parser';
import request from 'supertest';
import { URL, URLSearchParams } from 'url';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { createTestClient } from '../jest.setup';
import { seedDatabase } from '../seed';
import { initKeys } from './keys';

const app = express();
let client: ClientApplication;

describe('OAuth Authorize', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Authorize GET client not found', async () => {
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

  test('Authorize GET wrong redirect', async () => {
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

  test('Authorize GET invalid response_type', async () => {
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

  test('Authorize GET unsupported request', async () => {
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

  test('Authorize GET missing scope', async () => {
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

  test('Authorize GET success', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app).get('/oauth2/authorize?' + params.toString());
    expect(res.status).toBe(200);
  });

  test('Authorize POST client not found', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: '123',
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res.status).toBe(400);
  });

  test('Authorize POST wrong password', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'wrong-password',
        nonce: 'asdf',
      });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Incorrect password');
  });

  test('Authorize POST success without code_challenge', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();
    expect(location.searchParams.get('code')).not.toBeNull();
  });

  test('Authorize POST success with code_challenge', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();
    expect(location.searchParams.get('code')).not.toBeNull();
  });

  test('Authorize POST with code_challenge without code_challenge_method', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toEqual('invalid_request');
  });

  test('Authorize POST prompt=none and no existing login', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      prompt: 'none',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    const location = new URL(res.headers.location);
    expect(location.host).toBe('example.com');
    expect(location.searchParams.get('error')).toBe('login_required');
  });

  test('Authorize POST success and prompt=none', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']).toBeDefined();
    const cookies = setCookieParser.parse(res.headers['set-cookie']);
    expect(cookies.length).toBe(1);
    const cookie = cookies[0];
    const params2 = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      prompt: 'none',
    });
    const res2 = await request(app)
      .post('/oauth2/authorize?' + params2.toString())
      .set('Cookie', cookie.name + '=' + cookie.value)
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res2.status).toBe(302);
    expect(res2.headers.location).toBeDefined();
    const location = new URL(res2.headers.location);
    expect(location.host).toBe('example.com');
    expect(location.searchParams.get('error')).toBeNull();
    expect(location.searchParams.get('code')).not.toBeNull();
  });

  test('Authorize POST success and prompt=login', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
      });
    expect(res.status).toBe(302);
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']).toBeDefined();

    const cookies = setCookieParser.parse(res.headers['set-cookie']);
    expect(cookies.length).toBe(1);

    const cookie = cookies[0];
    const params2 = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
      prompt: 'login',
    });
    const res2 = await request(app)
      .get('/oauth2/authorize?' + params2.toString())
      .set('Cookie', cookie.name + '=' + cookie.value);
    expect(res2.status).toBe(200);
    expect(res2.text).toContain('<html');
  });

  test('Authorize POST using id_token_hint', async () => {
    // 1) Authorize as normal
    // 2) Get tokens
    // 3) Authorize using id_token_hint
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
        state: 'xyz',
      });
    expect(res.status).toBe(302);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();

    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: location.searchParams.get('code'),
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
});
