import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';
import { registerNew } from './register';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Reset Password', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Blank email address', async () => {
    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email: '',
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Valid email address is required');
    expect(res.body.issue[0].expression[0]).toBe('email');
  });

  test('Missing recaptcha', async () => {
    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email: 'admin@example.com',
      recaptchaToken: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Recaptcha token is required');
  });

  test('Incorrect recaptcha', async () => {
    setupRecaptchaMock(fetch as unknown as jest.Mock, false);

    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email: 'admin@example.com',
      recaptchaToken: 'wrong',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Recaptcha failed');
  });

  test('User not found', async () => {
    const res = await request(app)
      .post('/auth/resetpassword')
      .type('json')
      .send({
        email: `alex${randomUUID()}@example.com`,
        recaptchaToken: 'xyz',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
    expect(res.body.issue[0].expression[0]).toBe('email');
  });

  test('Success', async () => {
    const email = `george${randomUUID()}@example.com`;

    await registerNew({
      firstName: 'George',
      lastName: 'Washington',
      projectName: 'Washington Project',
      email,
      password: 'password!@#',
    });

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args.Destination.ToAddresses[0]).toBe(email);

    const parsed = await simpleParser(args.Content.Raw.Data);
    expect(parsed.subject).toBe('Medplum Password Reset');
  });
});
