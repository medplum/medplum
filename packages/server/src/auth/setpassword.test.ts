import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { generateSecret, initKeys } from '../oauth';
import { seedDatabase } from '../seed';

jest.mock('@aws-sdk/client-sesv2');

const app = express();

describe('Set Password', () => {
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
    (SESv2Client as any).mockClear();
    (SendEmailCommand as any).mockClear();
  });

  test('Success', async () => {
    const email = `george${randomUUID()}@example.com`;

    const res = await request(app).post('/auth/register').type('json').send({
      firstName: 'George',
      lastName: 'Washington',
      projectName: 'Washington Project',
      email,
      password: 'password!@#',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
    });
    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as any).mock.calls[0][0];
    const content = args.Content.Simple.Body.Text.Data;
    const url = /(https?:\/\/[^\s]+)/g.exec(content)?.[0] as string;
    const paths = url.split('/');
    const id = paths[paths.length - 2];
    const secret = paths[paths.length - 1];

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret,
      password: 'my-new-password',
    });
    expect(res3.status).toBe(200);

    // Make sure that the user can login with the new password
    const res4 = await request(app).post('/auth/login').type('json').send({
      email: email,
      password: 'my-new-password',
      scope: 'openid',
    });
    expect(res4.status).toBe(200);

    // Make sure that the PCR cannot be used again
    const res5 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret,
      password: 'bad-guys-trying-to-reuse-code',
    });
    expect(res5.status).toBe(400);
  });

  test('Wrong secret', async () => {
    const email = `george${randomUUID()}@example.com`;

    const res = await request(app).post('/auth/register').type('json').send({
      firstName: 'George',
      lastName: 'Washington',
      projectName: 'Washington Project',
      email,
      password: 'password!@#',
    });
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
    });
    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as any).mock.calls[0][0];
    const content = args.Content.Simple.Body.Text.Data;
    const url = /(https?:\/\/[^\s]+)/g.exec(content)?.[0] as string;
    const paths = url.split('/');
    const id = paths[paths.length - 2];

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret: 'WRONG!',
      password: 'my-new-password',
    });
    expect(res3.status).toBe(400);
  });

  test('Missing id', async () => {
    const res = await request(app)
      .post('/auth/setpassword')
      .type('json')
      .send({
        id: '',
        secret: generateSecret(16),
        password: 'my-new-password',
      });
    expect(res.status).toBe(400);
  });

  test('Missing secret', async () => {
    const res = await request(app).post('/auth/setpassword').type('json').send({
      id: randomUUID(),
      secret: '',
      password: 'my-new-password',
    });
    expect(res.status).toBe(400);
  });

  test('Missing password', async () => {
    const res = await request(app)
      .post('/auth/setpassword')
      .type('json')
      .send({
        id: randomUUID(),
        secret: generateSecret(16),
        password: '',
      });
    expect(res.status).toBe(400);
  });

  test('Not found', async () => {
    const res = await request(app)
      .post('/auth/setpassword')
      .type('json')
      .send({
        id: randomUUID(),
        secret: generateSecret(16),
        password: 'my-new-password',
      });
    expect(res.status).toBe(404);
  });
});
