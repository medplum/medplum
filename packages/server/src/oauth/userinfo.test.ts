import { ClientApplication } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { URL, URLSearchParams } from 'url';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { createTestClient } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let client: ClientApplication;

describe('OAuth2 UserInfo', () => {
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

  test('Get userinfo with profile email phone address', async () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid profile email phone address',
      code_challenge: 'xyz',
      code_challenge_method: 'plain',
    });
    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'medplum_admin',
        nonce: 'asdf',
        state: 'xyz',
      });
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
    expect(res2.body.access_token).toBeDefined();

    const res3 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + res2.body.access_token);
    expect(res3.status).toBe(200);
    expect(res3.body.sub).toBeDefined();
    expect(res3.body.profile).toBeDefined();
    expect(res3.body.name).toBe('Medplum Admin');
    expect(res3.body.given_name).toBe('Medplum');
    expect(res3.body.family_name).toBe('Admin');
    expect(res3.body.email).toBe('admin@example.com');
  });

  test('Get userinfo with only openid', async () => {
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
        password: 'medplum_admin',
        nonce: 'asdf',
        state: 'xyz',
      });
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
    expect(res2.body.access_token).toBeDefined();

    const res3 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + res2.body.access_token);
    expect(res3.status).toBe(200);
    expect(res3.body.sub).toBeDefined();
    expect(res3.body.profile).toBeUndefined();
    expect(res3.body.name).toBeUndefined();
    expect(res3.body.given_name).toBeUndefined();
    expect(res3.body.family_name).toBeUndefined();
    expect(res3.body.email).toBeUndefined();
    expect(res3.body.phone_number).toBeUndefined();
    expect(res3.body.address).toBeUndefined();
  });
});
