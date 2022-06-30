import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { assertOk } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { systemRepo } from '../fhir';
import { getUserByEmail, initKeys } from '../oauth';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';
import { registerNew } from './register';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

jest.mock('jose', () => {
  const original = jest.requireActual('jose');
  return {
    ...original,
    jwtVerify: jest.fn((credential: string) => {
      if (credential === 'invalid') {
        throw new Error('Verification failed');
      }
      return {
        payload: {
          // By convention for tests, return the credential as the email
          // Obviously in the real world the credential would be a JWT
          // And the Google Auth service returns the corresponding email
          email: credential,
        },
      };
    }),
  };
});

const app = express();

describe('Google Auth', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
  });

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Missing client ID', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: '',
      googleCredential: 'admin@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing googleClientId');
  });

  test('Invalid client ID', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: '123',
      googleCredential: 'admin@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Invalid googleClientId');
  });

  test('Missing googleCredential', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: getConfig().googleClientId,
      googleCredential: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing googleCredential');
  });

  test('Verification failed', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: getConfig().googleClientId,
      googleCredential: 'invalid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Verification failed');
  });

  test('Success', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: getConfig().googleClientId,
      googleCredential: 'admin@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('Create new user account', async () => {
    const email = 'new-google-' + randomUUID() + '@example.com';
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: getConfig().googleClientId,
      googleCredential: email,
    });
    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();

    const user = await getUserByEmail(email, undefined);
    expect(user).toBeDefined();
  });

  test('Require Google auth', async () => {
    const email = `google${randomUUID()}@example.com`;
    const password = 'password!@#';

    // Register and create a project
    const { project } = await registerNew({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
      email,
      password,
    });

    // As a super admin, update the project to require Google auth
    const [updateOutcome, updated] = await systemRepo.updateResource({
      ...project,
      features: ['google-auth-required'],
    });
    assertOk(updateOutcome, updated);

    // Then try to login with Google auth
    // This should succeed
    const res2 = await request(app).post('/auth/google').type('json').send({
      googleClientId: getConfig().googleClientId,
      googleCredential: email,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Custom Google client', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const googleClientId = 'google-client-id-' + randomUUID();

    // Register and create a project
    const { project } = await registerNew({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
      email,
      password,
    });

    // As a super admin, set the google client ID
    const [updateOutcome, updated] = await systemRepo.updateResource({
      ...project,
      site: [
        {
          name: 'Test Site',
          domain: ['example.com'],
          googleClientId,
        },
      ],
    });
    assertOk(updateOutcome, updated);

    // Try to login with the custom Google client
    // This should succeed
    const res2 = await request(app).post('/auth/google').type('json').send({
      googleClientId: googleClientId,
      googleCredential: email,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });
});
