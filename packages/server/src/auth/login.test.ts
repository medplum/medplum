import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { assertOk, createReference } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { systemRepo } from '../fhir';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { createTestClient, setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';
import { registerNew } from './register';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();
let client: ClientApplication;

describe('Login', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    client = await createTestClient();
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

  test('Invalid client UUID', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: '123',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Invalid UUID');
  });

  test('Invalid client ID', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: 'e99126bb-c748-4c00-8d28-4e88dfb88278',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
    });
    expect(res.status).toBe(404);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Not found');
  });

  test('Missing email', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email: '',
      password: 'medplum_admin',
      scope: 'openid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Valid email address is required');
  });

  test('Invalid email', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email: 'xyz',
      password: 'medplum_admin',
      scope: 'openid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Valid email address is required');
  });

  test('Missing password', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email: 'admin@example.com',
      password: '',
      scope: 'openid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Invalid password, must be at least 5 characters');
  });

  test('Wrong password', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email: 'admin@example.com',
      password: 'wrong-password',
      scope: 'openid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Email or password is invalid');
  });

  test('Success', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
    });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('Success default client', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
    });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('Login with access policy', async () => {
    const adminEmail = `admin${randomUUID()}@example.com`;
    const memberEmail = `member${randomUUID()}@example.com`;

    // Register and create a project
    const { project, accessToken } = await registerNew({
      firstName: 'Admin',
      lastName: 'Admin',
      projectName: 'Access Policy Project',
      email: adminEmail,
      password: 'password!@#',
    });

    // Create an access policy
    const resX = await request(app)
      .post('/fhir/R4/AccessPolicy')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'AccessPolicy',
        name: 'Test Access Policy',
        resource: [
          {
            resourceType: 'Patient',
            compartment: {
              reference: `Organization/${randomUUID()}`,
            },
          },
        ],
      });

    expect(resX.status).toBe(201);

    // Invite a new member
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        firstName: 'Member',
        lastName: 'Member',
        email: memberEmail,
      });

    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    // Parse the email for the "set password" link
    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    const parsed = await simpleParser(args.Content.Raw.Data);
    const content = parsed.text as string;
    const url = /(https?:\/\/[^\s]+)/g.exec(content)?.[0] as string;
    const paths = url.split('/');
    const id = paths[paths.length - 2];
    const secret = paths[paths.length - 1];

    // Get the project details
    // Make sure the new member is in the members list
    // Get the project details and members
    // 3 members total (1 admin, 1 client, 1 invited)
    const res3 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.project).toBeDefined();
    expect(res3.body.members).toBeDefined();
    expect(res3.body.members.length).toEqual(3);

    const owner = res3.body.members.find((m: any) => m.role === 'owner');
    expect(owner).toBeDefined();
    const member = res3.body.members.find((m: any) => m.role === 'member');
    expect(member).toBeDefined();

    // Get the new membership details
    const res4 = await request(app)
      .get('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);

    // Set the new member's access policy
    const res5 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + member.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        ...res4.body,
        accessPolicy: createReference(resX.body),
      });
    expect(res5.status).toBe(200);

    // Get the project details
    // Make sure the access policy is set
    // 3 members total (1 admin, 1 client, 1 invited)
    const res6 = await request(app)
      .get('/admin/projects/' + project.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
    expect(res6.body.project).toBeDefined();
    expect(res6.body.members).toBeDefined();
    expect(res6.body.members.length).toEqual(3);

    const member2 = res6.body.members.find((m: any) => m.role === 'member');
    expect(member2).toBeDefined();
    expect(member2.accessPolicy).toBeDefined();

    // Now try to login as the new member
    // First, set the password
    const res7 = await request(app).post('/auth/setpassword').type('json').send({
      id,
      secret,
      password: 'my-new-password',
    });
    expect(res7.status).toBe(200);

    // Then login
    const res8 = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email: memberEmail,
      password: 'my-new-password',
      scope: 'openid',
      remember: true,
    });
    expect(res8.status).toBe(200);
    expect(res8.body.code).toBeDefined();

    // Then get access token
    const res9 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      clientId: client.id,
      code: res8.body.code,
      code_verifier: 'xyz',
    });
    expect(res9.status).toBe(200);
    expect(res9.body.token_type).toBe('Bearer');
    expect(res9.body.scope).toBe('openid');
    expect(res9.body.expires_in).toBe(3600);
    expect(res9.body.id_token).toBeDefined();
    expect(res9.body.access_token).toBeDefined();
    expect(res9.body.refresh_token).toBeDefined();

    // Test the access policy
    // Should be able to create a patient
    const res10 = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + res9.body.access_token)
      .type('json')
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Access'],
            family: 'Test',
          },
        ],
      });
    expect(res10.status).toBe(201);

    // Should not be able to create an observation
    const res11 = await request(app)
      .post('/fhir/R4/Observation')
      .set('Authorization', 'Bearer ' + res9.body.access_token)
      .type('json')
      .send({
        resourceType: 'Observation',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              value: '1',
            },
          ],
        },
        subject: createReference(res10.body),
      });
    expect(res11.status).toBe(403);
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

    // Then try to login
    // This should fail with error message that google auth is required
    const res8 = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid',
      remember: true,
    });
    expect(res8.status).toBe(400);
    expect(res8.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: {
            text: 'Google authentication is required',
          },
        },
      ],
    });
  });
});
