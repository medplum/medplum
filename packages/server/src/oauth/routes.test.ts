import { ClientApplication } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { createTestClient } from '../test.setup';
import { initKeys } from './keys';

const app = express();
let client: ClientApplication;

describe('OAuth Routes', () => {
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

  test('Get token with client credentials', async () => {
    const res = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: client?.id as string,
        client_secret: client?.secret as string,
      });

    expect(res.status).toBe(200);

    const res2 = await request(app)
      .post('/fhir/R4/Patient/$validate')
      .set('Authorization', 'Bearer ' + res.body.access_token)
      .send({ resourceType: 'Patient' });

    expect(res2.status).toBe(200);
  });
});
