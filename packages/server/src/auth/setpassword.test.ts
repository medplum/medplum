// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { badRequest, createReference } from '@medplum/core';
import type { Login, UserSecurityRequest } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import { simpleParser } from 'mailparser';
import request from 'supertest';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { generateSecret } from '../oauth/keys';
import { tryLogin } from '../oauth/utils';
import { setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';
import { registerNew } from './register';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();

describe('Set Password', () => {
  let mockSESv2Client: AwsClientStub<SESv2Client>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockSESv2Client = mockClient(SESv2Client);
    mockSESv2Client.on(SendEmailCommand).resolves({ MessageId: 'ID_TEST_123' });

    fetchMock.mockClear();
    (pwnedPassword as unknown as Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as Mock, 0);
    setupRecaptchaMock(true);
    getConfig().recaptchaSecretKey = 'testrecaptchasecretkey';
  });

  afterEach(() => {
    mockSESv2Client.restore();
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

    const login = await tryLogin({
      authMethod: 'password',
      scope: 'openid email',
      email,
      password: 'password!@#',
      nonce: 'hqp9aew8yrpwiubejrg',
    });

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const userInfoRes1 = await request(app).get('/oauth2/userinfo').set('Authorization', `Bearer ${res.accessToken}`);
    expect(userInfoRes1).toHaveStatus(200);
    expect(userInfoRes1.body).toMatchObject({
      email,
      email_verified: false,
    });

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    const parsed = await simpleParser(args?.Content?.Raw?.Data as Buffer);
    const content = parsed.text as string;
    const url = /(https?:\/\/[^\s]+)/g.exec(content)?.[0] as string;
    const paths = url.split('/');
    const id = paths.at(-2);
    const secret = paths.at(-1);

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret,
      password: 'my-new-password',
    });
    expect(res3).toHaveStatus(200);

    // Make sure that the user can login with the new password
    const res4 = await request(app).post('/auth/login').type('json').send({
      email: email,
      password: 'my-new-password',
      scope: 'openid',
    });
    expect(res4).toHaveStatus(200);
    const newAccessToken = res4.body.access_token as string;

    // Make sure that the PCR cannot be used again
    const res5 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret,
      password: 'bad-guys-trying-to-reuse-code',
    });
    expect(res5).toHaveStatus(400);

    // User must log in again
    const userInfoRes2 = await request(app).get('/oauth2/userinfo').set('Authorization', `Bearer ${newAccessToken}`);
    expect(userInfoRes2).toHaveStatus(401);

    // Make sure that previous active login was revoked
    const userInfoRes3 = await request(app).get('/oauth2/userinfo').set('Authorization', `Bearer ${res.accessToken}`);
    expect(userInfoRes3).toHaveStatus(401);

    // Ensure other Logins are also revoked
    const otherLogin = await getGlobalSystemRepo().readResource<Login>('Login', login.id);
    expect(otherLogin.revoked).toBe(true);
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

    const systemRepo = await getProjectSystemRepo(project);
    const usr = await withTestContext(async () =>
      systemRepo.createResource<UserSecurityRequest>({
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
    expect(res3).toHaveStatus(200);

    // Make sure that the user can login with the new password
    const res4 = await request(app).post('/auth/login').type('json').send({
      email: email,
      password: 'my-new-password',
      scope: 'openid',
    });
    expect(res4).toHaveStatus(200);
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

    const systemRepo = await getProjectSystemRepo(project);
    const usr = await withTestContext(async () =>
      systemRepo.createResource<UserSecurityRequest>({
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
    expect(res3).toHaveStatus(400);
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
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    const parsed = await simpleParser(args?.Content?.Raw?.Data as Buffer);
    const content = parsed.text as string;
    const url = /(https?:\/\/[^\s]+)/g.exec(content)?.[0] as string;
    const paths = url.split('/');
    const id = paths[paths.length - 2];

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret: 'WRONG!',
      password: 'my-new-password',
    });
    expect(res3).toHaveStatus(400);
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
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    const parsed = await simpleParser(args?.Content?.Raw?.Data as Buffer);
    const content = parsed.text as string;
    const url = /(https?:\/\/[^\s]+)/g.exec(content)?.[0] as string;
    const paths = url.split('/');
    const id = paths.at(-2);
    const secret = paths.at(-1);

    // Mock the pwnedPassword function to return "1", meaning the password is breached.
    setupPwnedPasswordMock(pwnedPassword as unknown as Mock, 1);

    const res3 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret,
      password: 'breached',
    });
    expect(res3).toHaveStatus(400);
    expect(res3.body).toMatchObject(badRequest('Password found in breach database'));
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
    expect(res).toHaveStatus(400);
  });

  test('Missing secret', async () => {
    const res = await request(app).post('/auth/setpassword').type('json').send({
      id: randomUUID(),
      secret: '',
      password: 'my-new-password',
    });
    expect(res).toHaveStatus(400);
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
    expect(res).toHaveStatus(400);
  });

  test('Password too long', async () => {
    const res = await request(app)
      .post('/auth/setpassword')
      .type('json')
      .send({
        id: randomUUID(),
        secret: generateSecret(16),
        password: 'a'.repeat(73),
      });
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Password must be no more than 72 characters');
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
    expect(res).toHaveStatus(404);
  });
});
