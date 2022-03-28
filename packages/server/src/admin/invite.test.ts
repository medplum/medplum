import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { resolveId } from '@medplum/core';
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

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Admin Invite', () => {
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

  test('New user to project', async () => {
    // First, Alice creates a project
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    // Second, Alice invites Bob to the project
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + resolveId(res.body.project) + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });

    expect(res2.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args).toMatchObject({
      Destination: {
        ToAddresses: [bobEmail],
      },
      Content: {
        Simple: {
          Subject: {
            Data: 'Welcome to Medplum',
          },
        },
      },
    });
  });

  test('Existing user to project', async () => {
    // First, Alice creates a project
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    // Second, Bob creates a project
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app).post('/auth/register').type('json').send({
      firstName: 'Bob',
      lastName: 'Jones',
      projectName: 'Bob Project',
      email: bobEmail,
      password: 'password!@#',
      recaptchaToken: 'xyz',
    });

    expect(res2.status).toBe(200);
    expect(res2.body.project).toBeDefined();

    // Third, Alice invites Bob to the project
    // Because Bob already has an account, no emails should be sent
    const res3 = await request(app)
      .post('/admin/projects/' + resolveId(res.body.project) + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });

    expect(res3.status).toBe(200);
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args).toMatchObject({
      Destination: {
        ToAddresses: [bobEmail],
      },
      Content: {
        Simple: {
          Subject: {
            Data: 'Medplum: Welcome to Alice Project',
          },
        },
      },
    });
  });

  test('Existing practitioner to project', async () => {
    // First, Alice creates a project
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    // Second, Alice creates a Practitioner resource
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/fhir/R4/Practitioner')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({
        resourceType: 'Practitioner',
        name: [{ given: ['Bob'], family: 'Jones' }],
        telecom: [{ system: 'email', value: bobEmail }],
      });
    expect(res2.status).toBe(201);
    expect(res2.body.id).toBeDefined();

    // Third, Alice invites Bob to the project
    // Because there is already a practitioner with the same email,
    // we should reuse the existing Practitioner resource
    const res3 = await request(app)
      .post('/admin/projects/' + resolveId(res.body.project) + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });

    expect(res3.status).toBe(200);
    expect(res3.body.profile.resourceType).toBe('Practitioner');
    expect(res3.body.profile.id).toBe(res2.body.id);
  });

  test('Access denied', async () => {
    // First, Alice creates a project
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    // Second, Bob creates a project
    const res2 = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: `bob${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.project).toBeDefined();

    // Third, Bob tries to invite Carol to Alice's project
    // In this example, Bob is not an admin of Alice's project
    // So access is denied
    const res3 = await request(app)
      .post('/admin/projects/' + resolveId(res.body.project) + '/invite')
      .set('Authorization', 'Bearer ' + res2.body.accessToken)
      .send({
        firstName: 'Carol',
        lastName: 'Brown',
        email: `carol${randomUUID()}@example.com`,
      });

    expect(res3.status).toBe(404);
    expect(SESv2Client).not.toHaveBeenCalled();
    expect(SendEmailCommand).not.toHaveBeenCalled();
  });

  test('Input validation', async () => {
    // First, Alice creates a project
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    // Second, Alice invites Bob to the project
    // But she forgets his email address
    // So the request should fail
    const res2 = await request(app)
      .post('/admin/projects/' + resolveId(res.body.project) + '/invite')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        email: '',
      });

    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(SESv2Client).not.toHaveBeenCalled();
    expect(SendEmailCommand).not.toHaveBeenCalled();
  });
});
