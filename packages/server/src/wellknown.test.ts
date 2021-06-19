import express from 'express';
import validator from 'validator';
import request from 'supertest';
import { initApp } from './app';
import { loadConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { initKeys } from './oauth';

const app = express();

beforeAll(async () => {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await initApp(app);
  await initKeys(config);
});

afterAll(async () => {
  await closeDatabase();
});

test('Get /.well-known/jwks.json', async (done) => {
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
