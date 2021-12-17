import { assertOk } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { repo } from '../fhir';
import { seedDatabase } from '../seed';
import { initKeys } from './keys';
import { hashCode } from './token';

const app = express();
let config: MedplumServerConfig;
let client: ClientApplication;

describe('OAuth2 Token', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);

    const [outcome, resource] = await repo.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      secret: randomUUID(),
      redirectUri: 'https://example.com/',
    });
    assertOk(outcome);
    client = resource as ClientApplication;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Token with wrong Content-Type', async () => {
    const res = await request(app).post('/oauth2/token').type('json').send({
      foo: 'bar',
    });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Unsupported content type');
  });

  test('Token with missing grant type', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: '',
      code: 'fake-code',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing grant_type');
  });

  test('Token with unsupported grant type', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'xyz',
      code: 'fake-code',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Unsupported grant_type');
  });

  test('Token for client credentials success', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.access_token).toBeDefined();
  });

  test('Token for client credentials with missing client_id', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: '',
      client_secret: 'big-long-string',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing client_id');
  });

  test('Token for client credentials with missing client_secret', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing client_secret');
  });

  test('Token for client credentials with wrong client_id', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: randomUUID(),
      client_secret: 'big-long-string',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token for client credentials with wrong client_secret', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: 'wrong-client-id',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid secret');
  });

  test('Token for client empty secret', async () => {
    // Create a client without an secret
    const [outcome, badClient] = await repo.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      name: 'Bad Client',
      description: 'Bad Client',
      secret: '',
      redirectUri: 'https://example.com',
    });
    assertOk(outcome);

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: badClient?.id,
      client_secret: 'wrong-client-secret',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token for authorization_code with missing code', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: '',
      code_verifier: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing code');
  });

  test('Token for authorization_code with bad code', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: 'xyzxyz',
      code_verifier: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid code');
  });

  test('Token for authorization_code with invalid client ID', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      client_id: 'INVALID',
      code: '',
      code_verifier: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing code');
  });

  test('Authorization code token success', async () => {
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
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();
  });

  test('Authorization code token success with client ID', async () => {
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
    expect(res.headers.location).toBeDefined();

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();

    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: client.id as string,
        code: location.searchParams.get('code'),
        code_verifier: 'xyz',
      });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();
  });

  test('Authorization code token failure with client ID', async () => {
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
    expect(res.headers.location).toBeDefined();

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();

    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: 'wrong-client-id',
        code: location.searchParams.get('code'),
        code_verifier: 'xyz',
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('invalid_request');
    expect(res2.body.error_description).toBe('Invalid client');
  });

  test('Authorization code token failure already granted', async () => {
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
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: location.searchParams.get('code'),
        code_verifier: 'xyz',
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_grant');
    expect(res3.body.error_description).toBe('Token already granted');
  });

  test('Refresh token without token', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid refresh token');
  });

  test('Refresh token with malformed token', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid refresh token');
  });

  test('Refresh token success', async () => {
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
      })
      .expect(302);
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
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3.status).toBe(200);
    expect(res3.body.token_type).toBe('Bearer');
    expect(res3.body.scope).toBe('openid');
    expect(res3.body.expires_in).toBe(3600);
    expect(res3.body.id_token).toBeDefined();
    expect(res3.body.access_token).toBeDefined();
    expect(res3.body.refresh_token).toBeDefined();
  });

  test('Refresh token failure with S256 code', async () => {
    const code = randomUUID();
    const codeHash = hashCode(code);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: codeHash,
      code_challenge_method: 'S256',
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
    expect(res.headers.location).toBeDefined();

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBeNull();

    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: location.searchParams.get('code'),
        code_verifier: codeHash, // sending hash, should be code
      });
    expect(res2.status).toBe(400);
  });

  test('Refresh token success with S256 code', async () => {
    const code = randomUUID();
    const codeHash = hashCode(code);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.id as string,
      redirect_uri: client.redirectUri as string,
      scope: 'openid',
      code_challenge: codeHash,
      code_challenge_method: 'S256',
    });

    const res = await request(app)
      .post('/oauth2/authorize?' + params.toString())
      .type('form')
      .send({
        email: 'admin@example.com',
        password: 'admin',
        nonce: 'asdf',
        state: 'xyz',
      })
      .expect(302);
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
        code_verifier: code,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3.status).toBe(200);
    expect(res3.body.token_type).toBe('Bearer');
    expect(res3.body.scope).toBe('openid');
    expect(res3.body.expires_in).toBe(3600);
    expect(res3.body.id_token).toBeDefined();
    expect(res3.body.access_token).toBeDefined();
    expect(res3.body.refresh_token).toBeDefined();
  });

  test('Refresh token Basic auth success', async () => {
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
      })
      .expect(302);
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
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(200);
    expect(res3.body.token_type).toBe('Bearer');
    expect(res3.body.scope).toBe('openid');
    expect(res3.body.expires_in).toBe(3600);
    expect(res3.body.id_token).toBeDefined();
    expect(res3.body.access_token).toBeDefined();
    expect(res3.body.refresh_token).toBeDefined();
  });

  test('Refresh token Basic auth failure wrong auth type', async () => {
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
      })
      .expect(302);
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
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Bearer ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_request');
    expect(res3.body.error_description).toBe('Invalid authorization header');
  });

  test('Refresh token Basic auth failure wrong client ID', async () => {
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
      })
      .expect(302);
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
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Basic ' + Buffer.from('wrong-id' + ':' + client.secret).toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_grant');
    expect(res3.body.error_description).toBe('Incorrect client');
  });

  test('Refresh token Basic auth failure wrong secret', async () => {
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
      })
      .expect(302);
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
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':').toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_grant');
    expect(res3.body.error_description).toBe('Incorrect client secret');
  });
});
