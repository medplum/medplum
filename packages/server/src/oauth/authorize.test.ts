import { ClientApplication } from '@medplum/core';
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

test('Authorize GET client not found', async (done) => {
  request(app)
    .get('/oauth2/authorize?response_type=code&client_id=123&redirect_uri=https://example.com&scope=openid')
    .expect(400, done);
});

test('Authorize GET wrong redirect', async (done) => {
  request(app)
    .get('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example2.com&scope=openid')
    .expect(400, done);
});

test('Authorize GET invalid response_type', async (done) => {
  request(app)
    .get('/oauth2/authorize?response_type=xyz&client_id=' + client.id + '&redirect_uri=https://example.com&scope=openid')
    .expect(302)
    .end((err, res) => {
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toEqual('unsupported_response_type');
      done();
    });
});

test('Authorize GET unsupported request', async (done) => {
  request(app)
    .get('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example.com&request=xyz&scope=openid')
    .expect(302)
    .end((err, res) => {
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toEqual('request_not_supported');
      done();
    });
});

test('Authorize GET missing scope', async (done) => {
  request(app)
    .get('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example.com&request=xyz')
    .expect(302)
    .end((err, res) => {
      const location = new URL(res.headers.location);
      expect(location.searchParams.get('error')).toEqual('invalid_request');
      done();
    });
});

test('Authorize GET success', async (done) => {
  request(app)
    .get('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example.com&scope=openid')
    .expect(200, done);
});

test('Authorize POST client not found', async (done) => {
  request(app)
    .post('/oauth2/authorize?response_type=code&client_id=123&redirect_uri=https://example.com&scope=openid')
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'admin',
      nonce: 'asdf'
    })
    .expect(400, done);
});

test('Authorize POST wrong password', async (done) => {
  request(app)
    .post('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example.com&scope=openid')
    .type('form')
    .send({
      email: 'admin@medplum.com',
      password: 'wrong-password',
      nonce: 'asdf'
    })
    .expect(200)
    .end((err, res) => {
      console.log('wrong password body', res.body);
      done();
    });
});

test('Authorize POST success', async (done) => {
  request(app)
    .post('/oauth2/authorize?response_type=code&client_id=' + client.id + '&redirect_uri=https://example.com&scope=openid')
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
      done();
    });
});
