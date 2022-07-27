import { ClientApplication } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { URL, URLSearchParams } from 'url';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { createTestClient } from '../test.setup';
import { initKeys } from './keys';

const app = express();
let client: ClientApplication;

describe('OAuth Authorize', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
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
    expect(res.status).toBe(302);
  });
});
