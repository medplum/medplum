import express from 'express';
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

test('Get /openapi.json', async (done) => {
  request(app)
    .get('/openapi.json')
    .expect(200)
    .end((err, res) => {
      expect(res.body.openapi).not.toBeUndefined();
      expect(res.body.info).not.toBeUndefined();
      done();
    });
});
