import express from 'express';
import validator from 'validator';
import request from 'supertest';
import { initApp } from './app';
import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { initKeys } from './oauth';

const app = express();

beforeAll(async () => {
  const config = await loadTestConfig();
  await initDatabase(config.database);
  await initApp(app);
  await initKeys(config);
});

afterAll(async () => {
  await closeDatabase();
});

test('Get /.well-known/jwks.json', done => {
  request(app)
    .get('/.well-known/jwks.json')
    .expect(200)
    .end((err, res) => {
      const keys = res.body.keys;
      expect(keys).not.toBeUndefined();
      expect(Array.isArray(keys)).toEqual(true);
      expect(keys.length).toBeGreaterThanOrEqual(1);

      for (const key of keys) {
        expect(key.kid).not.toBeUndefined();
        expect(key.kid.length).toEqual(36); // kid should be a UUID
        expect(validator.isUUID(key.kid)).toEqual(true);
        expect(key.alg).toEqual('RS256');
        expect(key.kty).toEqual('RSA');
        expect(key.use).toEqual('sig');

        // Make sure public key properties are there
        expect(key.e).not.toBeUndefined();
        expect(key.n).not.toBeUndefined();

        // Make sure private key properties are *NOT* there
        expect(key.d).toBeUndefined();
        expect(key.p).toBeUndefined();
        expect(key.q).toBeUndefined();
        expect(key.dp).toBeUndefined();
        expect(key.dq).toBeUndefined();
        expect(key.qi).toBeUndefined();
      }

      done();
    });
});

test('Get /.well-known/openid-configuration', done => {
  request(app)
    .get('/.well-known/openid-configuration')
    .expect(200)
    .end((err, res) => {
      expect(res.body.issuer).not.toBeUndefined();
      expect(res.body.authorization_endpoint).not.toBeUndefined();
      expect(res.body.token_endpoint).not.toBeUndefined();
      expect(res.body.userinfo_endpoint).not.toBeUndefined();
      expect(res.body.jwks_uri).not.toBeUndefined();
      expect(res.body.id_token_signing_alg_values_supported).not.toBeUndefined();
      expect(res.body.response_types_supported).not.toBeUndefined();
      expect(res.body.subject_types_supported).not.toBeUndefined();
      done();
    });
});
