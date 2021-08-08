import { ClientApplication } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { isOk, repo } from '../fhir';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

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

test('Get userinfo with profile email phone address', async (done) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.id as string,
    redirect_uri: 'https://example.com',
    scope: 'openid profile email phone address',
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
          expect(res2.body.access_token).not.toBeUndefined();
          request(app)
            .get(`/oauth2/userinfo`)
            .set('Authorization', 'Bearer ' + res2.body.access_token)
            .expect(200)
            .end((err3, res3) => {
              expect(res3.status).toBe(200);
              expect(res3.body.sub).not.toBeUndefined();
              expect(res3.body.profile).not.toBeUndefined();
              expect(res3.body.name).toBe('Medplum Admin');
              expect(res3.body.given_name).toBe('Medplum');
              expect(res3.body.family_name).toBe('Admin');
              expect(res3.body.email).toBe('admin@medplum.com');
              expect(res3.body.phone).toBe('415-867-5309');
              expect(res3.body.address).toBe('742 Evergreen Terrace, Springfield, OR, 97403');
              done();
            });
        });
    });
});

test('Get userinfo with only openid', async (done) => {
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
          expect(res2.body.access_token).not.toBeUndefined();
          request(app)
            .get(`/oauth2/userinfo`)
            .set('Authorization', 'Bearer ' + res2.body.access_token)
            .expect(200)
            .end((err3, res3) => {
              expect(res3.status).toBe(200);
              expect(res3.body.sub).not.toBeUndefined();
              expect(res3.body.profile).toBeUndefined();
              expect(res3.body.name).toBeUndefined();
              expect(res3.body.given_name).toBeUndefined();
              expect(res3.body.family_name).toBeUndefined();
              expect(res3.body.email).toBeUndefined();
              expect(res3.body.phone).toBeUndefined();
              expect(res3.body.address).toBeUndefined();
              done();
            });
        });
    });
});
