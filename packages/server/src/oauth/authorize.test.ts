import { ClientApplication } from '@medplum/core';
import express from 'express';
import setCookieParser from 'set-cookie-parser';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { isOk, repo } from '../fhir';
import { seedDatabase } from '../seed';
import { initKeys } from './keys';

const app = express();
let client: ClientApplication;

beforeAll(async () => {
  const config = await loadTestConfig();
  await initDatabase(config.database);
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

test('Authorize GET client not found', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: '123',
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .get('/oauth2/authorize?' + params.toString())
    .expect(400, done);
});

test('Authorize GET wrong redirect', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example2.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .get('/oauth2/authorize?' + params.toString())
    .expect(400, done);
});

test('Authorize GET invalid response_type', done => {
  const params = new URLSearchParams({
    response_type: 'xyz',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .get('/oauth2/authorize?' + params.toString())
    .expect(302)
    .end((err, res) => {
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toEqual('unsupported_response_type');
      done();
    });
});

test('Authorize GET unsupported request', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain',
    request: 'unsupported-request'
  });
  request(app)
    .get('/oauth2/authorize?' + params.toString())
    .expect(302)
    .end((err, res) => {
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toEqual('request_not_supported');
      done();
    });
});

test('Authorize GET missing scope', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .get('/oauth2/authorize?' + params.toString())
    .expect(302)
    .end((err, res) => {
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toEqual('invalid_request');
      done();
    });
});

test('Authorize GET success', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .get('/oauth2/authorize?' + params.toString())
    .expect(200, done);
});

test('Authorize POST client not found', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: '123',
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(400, done);
});

test('Authorize POST wrong password', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'wrong-password',
      nonce: 'asdf'
    })
    .expect(200)
    .end((err, res) => {
      expect(res.text).toContain('Incorrect password');
      done();
    });
});

test('Authorize POST success without code_challenge', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(302)
    .end((err, res) => {
      expect(res.status).toBe(302);
      expect(res.headers.location).not.toBeUndefined();
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toBeNull();
      expect(location.searchParams.get('code')).not.toBeNull();
      done();
    });
});

test('Authorize POST success with code_challenge', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(302)
    .end((err, res) => {
      expect(res.status).toBe(302);
      expect(res.headers.location).not.toBeUndefined();
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toBeNull();
      expect(location.searchParams.get('code')).not.toBeNull();
      done();
    });
});

test('Authorize POST with code_challenge without code_challenge_method', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(302)
    .end((err, res) => {
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toEqual('invalid_request');
      done();
    });
});

test('Authorize POST prompt=none and no existing login', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain',
    prompt: 'none'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(302)
    .end((err, res) => {
      expect(res.status).toBe(302);
      expect(res.headers.location).not.toBeUndefined();
      const location = new URL(res.headers.location);
      expect(location.host).toBe('example.com');
      expect(location.searchParams.get('error')).toBe('login_required');
      done();
    });
});

test('Authorize POST success and prompt=none', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(302)
    .end((err, res) => {
      expect(res.status).toBe(302);
      expect(res.headers['set-cookie']).not.toBeUndefined();
      const cookies = setCookieParser.parse(res.headers['set-cookie']);
      expect(cookies.length).toBe(1);
      const cookie = cookies[0];
      const params2 = new URLSearchParams({
        response_type: 'code',
        client_id: client.id as string,
        redirect_uri: 'https://example.com',
        scope: 'openid',
        code_challenge: 'xyz',
        code_challenge_method: 'plain',
        prompt: 'none'
      });
      request(app)
        .post('/oauth2/authorize?' + params2.toString())
        .set('Cookie', cookie.name + '=' + cookie.value)
        .type('form')
        .send({
          email: 'admin@medplum.com',
          password: 'admin',
          nonce: 'asdf'
        })
        .expect(302)
        .end((err2, res2) => {
          expect(res2.status).toBe(302);
          expect(res2.headers.location).not.toBeUndefined();
          const location = new URL(res2.headers.location);
          expect(location.host).toBe('example.com');
          expect(location.searchParams.get('error')).toBeNull();
          expect(location.searchParams.get('code')).not.toBeNull();
          done();
        });
    });
});

test('Authorize POST success and prompt=login', done => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(302)
    .end((err, res) => {
      expect(res.status).toBe(302);
      expect(res.headers['set-cookie']).not.toBeUndefined();
      const cookies = setCookieParser.parse(res.headers['set-cookie']);
      expect(cookies.length).toBe(1);
      const cookie = cookies[0];
      const params2 = new URLSearchParams({
        response_type: 'code',
        client_id: client.id as string,
        redirect_uri: 'https://example.com',
        scope: 'openid',
        code_challenge: 'xyz',
        code_challenge_method: 'plain',
        prompt: 'login'
      });
      request(app)
        .get('/oauth2/authorize?' + params2.toString())
        .set('Cookie', cookie.name + '=' + cookie.value)
        .expect(200)
        .end((err, res) => {
          expect(res.status).toBe(200);
          expect(res.text).toContain('<html');
          done();
        });
    });
});

test('Authorize POST using id_token_hint', done => {
  // 1) Authorize as normal
  // 2) Get tokens
  // 3) Authorize using id_token_hint
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid',
    code_challenge: 'xyz',
    code_challenge_method: 'plain'
  });
  request(app)
    .post('/oauth2/authorize?' + params.toString())
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
          code: location.searchParams.get('code'),
          code_verifier: 'xyz'
        })
        .expect(200)
        .end((err2, res2) => {
          expect(res2.status).toBe(200);
          expect(res2.body.id_token).not.toBeUndefined();
          const params2 = new URLSearchParams({
            response_type: 'code',
            client_id: client.id as string,
            redirect_uri: 'https://example.com',
            scope: 'openid',
            code_challenge: 'xyz',
            code_challenge_method: 'plain',
            id_token_hint: res2.body.id_token
          });
          request(app)
            .get('/oauth2/authorize?' + params2.toString())
            .expect(200)
            .end((err3, res3) => {
              expect(res3.status).toBe(302);
              expect(res3.headers.location).not.toBeUndefined();
              const location = new URL(res3.headers.location);
              expect(location.host).toBe('example.com');
              expect(location.searchParams.get('error')).toBeNull();
              expect(location.searchParams.get('code')).not.toBeNull();
              done();
            });
        });
    });
});
