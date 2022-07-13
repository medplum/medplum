import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Bot admin', () => {
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

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Create new bot', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    // Next, Alice creates a bot
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });
    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('Bot');
    expect(res2.body.id).toBeDefined();

    // Read the bot
    const res3 = await request(app)
      .get('/fhir/R4/Bot/' + res2.body.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.resourceType).toBe('Bot');
    expect(res3.body.id).toBe(res2.body.id);

    // Create bot with invalid name (should fail)
    const res4 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ foo: 'bar' });
    expect(res4.status).toBe(400);
  });
});
