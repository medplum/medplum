import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { getDefaultClientApplication, seedDatabase } from '../seed';

const app = express();

describe('Login', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Invalid client UUID', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        clientId: '123',
        email: 'admin@medplum.com',
        password: 'admin',
        scope: 'openid'
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).not.toBeUndefined();
    expect(res.body.issue[0].details.text).toBe('Invalid UUID');
  });

  test('Invalid client ID', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        clientId: 'e99126bb-c748-4c00-8d28-4e88dfb88278',
        email: 'admin@medplum.com',
        password: 'admin',
        scope: 'openid'
      });
    expect(res.status).toBe(404);
    expect(res.body.issue).not.toBeUndefined();
    expect(res.body.issue[0].details.text).toBe('Not found');
  });

  test('Wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        clientId: getDefaultClientApplication().id,
        email: 'admin@medplum.com',
        password: 'wrong-password',
        scope: 'openid'
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).not.toBeUndefined();
    expect(res.body.issue[0].details.text).toBe('Incorrect password');
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        clientId: getDefaultClientApplication().id,
        email: 'admin@medplum.com',
        password: 'admin',
        scope: 'openid'
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

});
