import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Me', () => {
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

  test('Unauthenticated', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('Get default user configuration', async () => {
    const res1 = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res1.status).toBe(200);
    expect(res1.body.accessToken).toBeDefined();

    const res2 = await request(app).get('/auth/me').set('Authorization', `Bearer ${res1.body.accessToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toBeDefined();
    expect(res2.body.profile).toBeDefined();
    expect(res2.body.profile.resourceType).toBe('Practitioner');
    expect(res2.body.config).toBeDefined();
    expect(res2.body.config.resourceType).toBe('UserConfiguration');
  });
});
