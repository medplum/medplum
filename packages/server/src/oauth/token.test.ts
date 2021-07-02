import { ClientApplication } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { isOk, repo } from '../fhir';
import { seedDatabase } from '../seed';
import { initKeys } from './keys';

const app = express();
let client: ClientApplication;

beforeAll(async () => {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await seedDatabase();
  await initApp(app);
  await initKeys(config);

  const [outcome, result] = await repo.createResource({
    resourceType: 'ClientApplication',
    secret: 'big-long-string',
    redirectUri: 'https://example.com'
  } as ClientApplication);

  if (!isOk(outcome) || !result) {
    console.log(JSON.stringify(outcome, undefined, 2));
    throw new Error('Error creating application');
  }

  client = result;
});

afterAll(async () => {
  await closeDatabase();
});

test('Token with wrong Content-Type', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('json')
    .send({
      foo: 'bar'
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.text).toBe('Unsupported content type');
      done();
    });
});

test('Token with missing grant type', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: '',
      code: 'fake-code'
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Missing grant_type');
      done();
    });
});

test('Token with unsupported grant type', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'xyz',
      code: 'fake-code'
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Unsupported grant_type');
      done();
    });
});

test('Token for client credentials with missing client_id', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'client_credentials',
      client_id: '',
      client_secret: 'big-long-string'
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Missing client_id');
      done();
    });
});

test('Token for client credentials with missing client_secret', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: ''
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Missing client_secret');
      done();
    });
});

test('Token for client credentials with wrong client_id', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'client_credentials',
      client_id: randomUUID(),
      client_secret: 'big-long-string'
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Invalid client');
      done();
    });
});

test('Token for client credentials with wrong client_secret', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: 'wrong-client-id'
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Invalid secret');
      done();
    });
});

test('Token for authorization_code with missing code', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code: ''
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Missing code');
      done();
    });
});

test('Token for authorization_code with bad code', async (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code: 'xyzxyz'
    })
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Invalid code');
      done();
    });
});

test('Authorization code token success', async (done) => {
  request(app)
    .post('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example.com&scope=openid')
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf',
      state: 'xyz'
    })
    .expect(302)
    .end((err, res) => {
      expect(res.status).toBe(302);
      expect(res.headers.location).not.toBeUndefined();
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toBeNull();
      request(app)
        .post('/oauth2/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: location.searchParams.get('code')
        })
        .expect(200)
        .end((err2, res2) => {
          expect(res2.status).toBe(200);
          expect(res2.body.token_type).toBe('Bearer');
          expect(res2.body.scope).toBe('openid');
          expect(res2.body.expires_in).toBe(3600);
          expect(res2.body.id_token).not.toBeUndefined();
          expect(res2.body.access_token).not.toBeUndefined();
          expect(res2.body.refresh_token).not.toBeUndefined();
          done();
        });
    });
});

test('Refresh token without token', (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'refresh_token',
      refresh_token: ''
    })
    .expect(400)
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Invalid refresh token');
      done();
    });
});

test('Refresh token with malformed token', (done) => {
  request(app)
    .post('/oauth2/token')
    .type('form')
    .send({
      grant_type: 'refresh_token',
      refresh_token: 'xyz'
    })
    .expect(400)
    .end((err, res) => {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toBe('Invalid refresh token');
      done();
    });
});

test('Refresh token success', async (done) => {
  request(app)
    .post('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example.com&scope=openid')
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf',
      state: 'xyz'
    })
    .expect(302)
    .end((err, res) => {
      expect(res.status).toBe(302);
      expect(res.headers.location).not.toBeUndefined();
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toBeNull();
      request(app)
        .post('/oauth2/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: location.searchParams.get('code')
        })
        .expect(200)
        .end((err2, res2) => {
          expect(res2.status).toBe(200);
          expect(res2.body.token_type).toBe('Bearer');
          expect(res2.body.scope).toBe('openid');
          expect(res2.body.expires_in).toBe(3600);
          expect(res2.body.id_token).not.toBeUndefined();
          expect(res2.body.access_token).not.toBeUndefined();
          expect(res2.body.refresh_token).not.toBeUndefined();
          request(app)
            .post('/oauth2/token')
            .type('form')
            .send({
              grant_type: 'refresh_token',
              refresh_token: res2.body.refresh_token
            })
            .expect(200)
            .end((err3, res3) => {
              expect(res3.status).toBe(200);
              expect(res3.body.token_type).toBe('Bearer');
              expect(res3.body.scope).toBe('openid');
              expect(res3.body.expires_in).toBe(3600);
              expect(res3.body.id_token).not.toBeUndefined();
              expect(res3.body.access_token).not.toBeUndefined();
              expect(res3.body.refresh_token).not.toBeUndefined();
              done();
            });
        });
    });
});
