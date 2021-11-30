import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();

describe('Change Password', () => {

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

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        oldPassword: 'password!@#',
        newPassword: 'password!@#123'
      });

    expect(res2.status).toBe(200);
  });

  test('Missing old password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        oldPassword: '',
        newPassword: 'password!@#123'
      });

    expect(res2.status).toBe(400);
  });

  test('Incorrect old password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        oldPassword: 'foobarbang',
        newPassword: 'password!@#123'
      });

    expect(res2.status).toBe(400);
  });

});
