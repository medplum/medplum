import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { badRequest, createReference } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { generateSecret } from '../oauth/keys';
import { setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';
import { registerNew } from './register';
import { getSystemRepo } from '../fhir/repo';
import { UserSecurityRequest } from '@medplum/fhirtypes';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Set Password', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
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

  test('Success', async () => {
    const email = `george${randomUUID()}@example.com`;

    const res = await withTestContext(() =>
      registerNew({
        projectName: 'Set Password Project',
        firstName: 'George',
        lastName: 'Washington',
        email,
        password: 'password!@#',
        scope: 'openid profile email',
      })
    );
    expect(res).toBeDefined();

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const userInfoRes1 = await request(app).get('/oauth2/userinfo').set('Authorization', `Bearer ${res.accessToken}`);
    expect(userInfoRes1.status).toBe(200);
    expect(userInfoRes1.body).toMatchObject({
      email,
      email_verified: false,
    });

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    const parsed = await simpleParser(args.Content.Raw.Data);
    const content = parsed.text as string;
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

    const userInfoRes2 = await request(app).get('/oauth2/userinfo').set('Authorization', `Bearer ${res.accessToken}`);
    expect(userInfoRes2.status).toBe(200);
    expect(userInfoRes2.body).toMatchObject({
      email,
      email_verified: true,
    });
  });

  test('UserSecurityRequest', async () => {
    const email = `george${randomUUID()}@example.com`;

    const { user, project } = await withTestContext(() =>
      registerNew({
        projectName: 'Set Password Project',
        firstName: 'George',
        lastName: 'Washington',
        email,
        password: 'password!@#',
        scope: 'openid profile email',
      })
    );

    const usr = await withTestContext(async () =>
      getSystemRepo().createResource<UserSecurityRequest>({
        resourceType: 'UserSecurityRequest',
        meta: {
          project: project.id,
        },
        type: 'reset',
        user: createReference(user),
        secret: generateSecret(16),
      })
    );

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id: usr.id,
      secret: usr.secret,
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
  });

  test('UserSecurityRequest invalid type', async () => {
    const email = `george${randomUUID()}@example.com`;

    const { user, project } = await withTestContext(() =>
      registerNew({
        projectName: 'Set Password Project',
        firstName: 'George',
        lastName: 'Washington',
        email,
        password: 'password!@#',
        scope: 'openid profile email',
      })
    );

    const usr = await withTestContext(async () =>
      getSystemRepo().createResource<UserSecurityRequest>({
        resourceType: 'UserSecurityRequest',
        meta: {
          project: project.id,
        },
        type: 'verify-email', // Invalid type
        user: createReference(user),
        secret: generateSecret(16),
      })
    );

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id: usr.id,
      secret: usr.secret,
      password: 'my-new-password',
    });
    expect(res3.status).toBe(400);
  });

  test('Wrong secret', async () => {
    const email = `george${randomUUID()}@example.com`;

    const res = await request(app).post('/auth/newuser').type('json').send({
      firstName: 'George',
      lastName: 'Washington',
      email,
      password: 'password!@#',
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    const parsed = await simpleParser(args.Content.Raw.Data);
    const content = parsed.text as string;
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

  test('Breached password', async () => {
    const email = `george${randomUUID()}@example.com`;

    const res = await request(app).post('/auth/newuser').type('json').send({
      firstName: 'George',
      lastName: 'Washington',
      email,
      password: 'password!@#',
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    const parsed = await simpleParser(args.Content.Raw.Data);
    const content = parsed.text as string;
    const url = /(https?:\/\/[^\s]+)/g.exec(content)?.[0] as string;
    const paths = url.split('/');
    const id = paths[paths.length - 2];
    const secret = paths[paths.length - 1];

    // Mock the pwnedPassword function to return "1", meaning the password is breached.
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 1);

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret,
      password: 'breached',
    });
    expect(res3.status).toBe(400);
    expect(res3.body).toMatchObject(badRequest('Password found in breach database', 'password'));
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
