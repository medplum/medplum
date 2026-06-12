// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { createReference, getReferenceString, Operator, resolveId } from '@medplum/core';
import type { DomainConfiguration, Project, User, UserSecurityRequest } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';
import request from 'supertest';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';
import { registerNew } from './register';

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: '123' });
  const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
  return { mockCreateTransport, mockSendMail };
});

vi.mock('hibp');
vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
  default: { createTransport: mockCreateTransport },
}));

describe('Reset Password', () => {
  const app = express();
  const systemRepo = getGlobalSystemRepo();
  const testRecaptchaSecretKey = 'testrecaptchasecretkey';
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

    (fetch as unknown as Mock).mockClear();
    (pwnedPassword as unknown as Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as Mock, 0);
    setupRecaptchaMock(fetch as unknown as Mock, true);
    getConfig().recaptchaSecretKey = testRecaptchaSecretKey;
  });

  afterEach(() => {
    mockSESv2Client.restore();
  });

  test('Blank email address', async () => {
    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email: '',
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Valid email address between 3 and 72 characters is required');
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
    setupRecaptchaMock(fetch as unknown as Mock, false);

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
    expect(res.status).toBe(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Success', async () => {
    const email = `george${randomUUID()}@example.com`;

    await withTestContext(() =>
      registerNew({
        firstName: 'George',
        lastName: 'Washington',
        projectName: 'Washington Project',
        email,
        password: 'password!@#',
      })
    );

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.ToAddresses?.[0]).toBe(email);

    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.subject).toBe('Medplum Password Reset');
  });

  test('Success no send email', async () => {
    const email = `george${randomUUID()}@example.com`;

    await withTestContext(() =>
      registerNew({
        firstName: 'George',
        lastName: 'Washington',
        projectName: 'Washington Project',
        email,
        password: 'password!@#',
      })
    );

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: 'xyz',
      sendEmail: false,
    });
    expect(res2.status).toBe(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Success with no recaptcha secret key and missing recaptchaToken', async () => {
    getConfig().recaptchaSecretKey = '';

    const email = `george${randomUUID()}@example.com`;

    await withTestContext(() =>
      registerNew({
        firstName: 'George',
        lastName: 'Washington',
        projectName: 'Washington Project',
        email,
        password: 'password!@#',
      })
    );

    const res2 = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaToken: '',
    });
    expect(res2.status).toBe(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.ToAddresses?.[0]).toBe(email);

    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.subject).toBe('Medplum Password Reset');
  });

  test('Project-scoped user uses project SMTP', async () => {
    const email = `project-smtp-${randomUUID()}@example.com`;
    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    const project = await withTestContext(async () => {
      const project = await systemRepo.createResource<Project>({
        resourceType: 'Project',
        name: 'Project SMTP Reset Project',
        secret: [
          { name: 'smtpHost', valueString: 'smtp.project.example.com' },
          { name: 'smtpPort', valueInteger: 587 },
          { name: 'smtpUsername', valueString: 'projectuser' },
          { name: 'smtpPassword', valueString: 'projectpass' },
          { name: 'smtpFromAddress', valueString: 'support@project.example.com' },
        ],
      });
      await systemRepo.createResource<User>({
        resourceType: 'User',
        meta: { project: project.id },
        firstName: 'Reset',
        lastName: 'Reset',
        email,
        passwordHash: 'abc',
        project: createReference(project),
      });
      return project;
    });

    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      projectId: project.id,
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(200);

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.project.example.com', port: 587 })
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].from).toBe('support@project.example.com');
    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('External auth', async () => {
    // Create a domain with external auth
    const domain = randomUUID() + '.example.com';
    await withTestContext(() =>
      systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://example.com/oauth2/authorize',
          tokenUrl: 'https://example.com/oauth2/token',
          userInfoUrl: 'https://example.com/oauth2/userinfo',
          clientId: '123',
          clientSecret: '456',
        },
      })
    );

    const res = await request(app)
      .post('/auth/resetpassword')
      .type('json')
      .send({
        email: `alice@${domain}`,
        recaptchaToken: 'xyz',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe(
      'Cannot reset password for external auth. Contact your system administrator.'
    );
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Custom reCAPTCHA site key success', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const recaptchaSiteKey = 'recaptcha-site-key-' + randomUUID();
    const recaptchaSecretKey = 'recaptcha-secret-key-' + randomUUID();

    await withTestContext(async () => {
      // Register and create a project
      const { project } = await registerNew({
        firstName: 'Reset',
        lastName: 'Reset',
        projectName: 'Reset Project',
        email,
        password,
      });
      // As a super admin, set the recaptcha site key
      // and the default access policy
      await systemRepo.updateResource({
        ...project,
        site: [
          {
            name: 'Test Site',
            domain: ['example.com'],
            recaptchaSiteKey,
            recaptchaSecretKey,
          },
        ],
      });
      return project;
    });

    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      recaptchaSiteKey,
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.ToAddresses?.[0]).toBe(email);

    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.subject).toBe('Medplum Password Reset');
  });

  test('Custom reCAPTCHA site key not found', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const recaptchaSiteKey = 'recaptcha-site-key-' + randomUUID();

    const project = await withTestContext(async () => {
      // Register and create a project
      const { project } = await registerNew({
        firstName: 'Reset',
        lastName: 'Reset',
        projectName: 'Reset Project',
        email,
        password,
      });
      // As a super admin, set the recaptcha site key
      // and the default access policy
      await systemRepo.updateResource({
        ...project,
        site: [
          {
            name: 'Test Site',
            domain: ['example.com'],
            recaptchaSiteKey,
          },
        ],
      });
      return project;
    });

    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      projectId: project.id,
      recaptchaSiteKey,
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ issue: [{ code: 'invalid', details: { text: 'Invalid recaptchaSecretKey' } }] });
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('Custom reCAPTCHA site key not found', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const recaptchaSiteKey = 'recaptcha-site-key-' + randomUUID();

    const project = await withTestContext(async () => {
      // Register and create a project
      const { project } = await registerNew({
        firstName: 'Reset',
        lastName: 'Reset',
        projectName: 'Reset Project',
        email,
        password,
      });
      return project;
    });

    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      projectId: project.id,
      recaptchaSiteKey,
      recaptchaToken: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ issue: [{ code: 'invalid', details: { text: 'Invalid recaptchaSiteKey' } }] });
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  // User is present but project is not assigned to it.
  test('User without project', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';

    const project = await withTestContext(async () => {
      // Register and create a project
      const { project } = await registerNew({
        firstName: 'Reset',
        lastName: 'Reset',
        projectName: 'Reset Project',
        email,
        password,
      });
      return project;
    });

    // Attempt to reset the password for the user without a project
    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      projectId: project.id,
      recaptchaToken: 'xyz',
    });

    // Verify the response and expectations
    expect(res.status).toBe(200);
    expect(res.body.issue[0].details.text).toBe('All OK');
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  test('User with the project success', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';

    const project = await withTestContext(async () => {
      // Register and create a project
      const { project, user } = await registerNew({
        firstName: 'Reset',
        lastName: 'Reset',
        projectName: 'Reset Project',
        email,
        password,
      });

      // Add the project to the user
      await systemRepo.patchResource('User', resolveId(user) as string, [
        {
          path: '/project',
          op: 'add',
          value: createReference(project),
        },
      ]);

      return project;
    });

    // Attempt to reset the password for the user with a project
    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      projectId: project.id,
      recaptchaToken: 'xyz',
    });

    // Verify the response and expectations
    expect(res.status).toBe(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    // Verify email details
    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.ToAddresses?.[0]).toBe(email);

    // Verify parsed email content
    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.subject).toBe('Medplum Password Reset');
  });

  test('Password change request with redirectUri', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { project, user } = await withTestContext(async () => {
      // Register and create a project
      const { project, user } = await registerNew({
        firstName: 'Reset',
        lastName: 'Reset',
        projectName: 'Reset Project',
        email,
        password,
      });

      // Add the project to the user
      await systemRepo.patchResource('User', resolveId(user) as string, [
        {
          path: '/project',
          op: 'add',
          value: createReference(project),
        },
      ]);

      return { project, user };
    });

    // Attempt to reset the password for the user with a project
    const res = await request(app).post('/auth/resetpassword').type('json').send({
      email,
      projectId: project.id,
      recaptchaToken: 'xyz',
      redirectUri: 'http://example.com',
    });

    // Verify the response and expectations
    expect(res.status).toBe(200);
    expect(mockSESv2Client.commandCalls(SendEmailCommand)).toHaveLength(1);

    // Get newly created UserSecurityRequest
    const userSecurityRequest = (await withTestContext(async () =>
      systemRepo.searchOne<UserSecurityRequest>({
        resourceType: 'UserSecurityRequest',
        filters: [
          {
            code: 'user',
            operator: Operator.EQUALS,
            value: getReferenceString(user),
          },
        ],
      })
    )) as UserSecurityRequest;

    // Verify UserSecurityRequest.redirectUri
    expect(userSecurityRequest.redirectUri).toBe('http://example.com');

    // Verify email details
    const args = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(args.Destination?.ToAddresses?.[0]).toBe(email);

    // Verify parsed email content
    const parsed = await simpleParser(args.Content?.Raw?.Data as Buffer);
    expect(parsed.subject).toBe('Medplum Password Reset');
  });
});
