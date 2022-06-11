import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { assertOk, resolveId } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { SpyInstance, vi } from 'vitest';
import { initApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { systemRepo } from '../fhir/repo';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';

vi.mock('@aws-sdk/client-sesv2');
vi.mock('hibp');
vi.mock('jose');
vi.mock('node-fetch');

const app = express();

describe('Google Auth', () => {
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
    (SESv2Client as unknown as SpyInstance).mockClear();
    (SendEmailCommand as unknown as SpyInstance).mockClear();
    (fetch as unknown as SpyInstance).mockClear();
    (pwnedPassword as unknown as SpyInstance).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as SpyInstance, 0);
    setupRecaptchaMock(fetch as unknown as SpyInstance, true);
  });

  test('Missing client ID', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      clientId: '',
      credential: 'admin@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing clientId');
  });

  test('Invalid client ID', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      clientId: '123',
      credential: 'admin@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Invalid Google Client ID');
  });

  test('Missing credential', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      clientId: getConfig().googleClientId,
      credential: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing credential');
  });

  test('Verification failed', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      clientId: getConfig().googleClientId,
      credential: 'invalid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Verification failed');
  });

  test('Success', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      clientId: getConfig().googleClientId,
      credential: 'admin@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('Require Google auth', async () => {
    const email = `google${randomUUID()}@example.com`;
    const password = 'password!@#';

    // Register and create a project
    const res = await request(app).post('/auth/register').type('json').send({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
      email,
      password,
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    // As a super admin, update the project to require Google auth
    const projectId = resolveId(res.body.project) as string;
    const [updateOutcome, updated] = await systemRepo.patchResource('Project', projectId, [
      {
        op: 'add',
        path: '/features',
        value: ['google-auth-required'],
      },
    ]);
    assertOk(updateOutcome, updated);

    // Then try to login with Google auth
    // This should succeed
    const res2 = await request(app).post('/auth/google').type('json').send({
      clientId: getConfig().googleClientId,
      credential: email,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Custom Google client', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const googleClientId = 'google-client-id-' + randomUUID();

    // Register and create a project
    const res = await request(app).post('/auth/register').type('json').send({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
      email,
      password,
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    // As a super admin, set the google client ID
    const projectId = resolveId(res.body.project) as string;
    const [updateOutcome, updated] = await systemRepo.patchResource('Project', projectId, [
      {
        op: 'add',
        path: '/googleClientId',
        value: [googleClientId],
      },
    ]);
    assertOk(updateOutcome, updated);

    // Try to login with the custom Google client
    // This should succeed
    const res2 = await request(app).post('/auth/google').type('json').send({
      clientId: googleClientId,
      credential: email,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });
});
