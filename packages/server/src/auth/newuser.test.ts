import { badRequest } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('New user', () => {
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

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();
  });

  test('Missing recaptcha', async () => {
    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Recaptcha token is required');
  });

  test('Incorrect recaptcha', async () => {
    setupRecaptchaMock(fetch as unknown as jest.Mock, false);

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'wrong',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Recaptcha failed');
  });

  test('Breached password', async () => {
    // Mock the pwnedPassword function to return "1", meaning the password is breached.
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 1);

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'breached',
        recaptchaToken: 'wrong',
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('Password found in breach database', 'password'));
  });

  test('Email already registered', async () => {
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      email: `george${randomUUID()}@example.com`,
      password: 'password!@#',
      recaptchaToken: 'xyz',
    };

    const res = await request(app).post('/auth/newuser').type('json').send(registerRequest);
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/auth/newuser').type('json').send(registerRequest);
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toBe('Email already registered');
  });
});
