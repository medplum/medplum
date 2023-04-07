import { badRequest } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';
import { registerNew } from './register';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('New user', () => {
  let prevRecaptchaSecretKey: string | undefined;
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    prevRecaptchaSecretKey = getConfig().recaptchaSecretKey;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
    getConfig().recaptchaSecretKey = prevRecaptchaSecretKey;
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();
  });

  test('Missing recaptcha', async () => {
    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Recaptcha token is required');
  });

  test('Incorrect recaptcha', async () => {
    setupRecaptchaMock(fetch as unknown as jest.Mock, false);

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'wrong',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Recaptcha failed');
  });

  test('Breached password', async () => {
    // Mock the pwnedPassword function to return "1", meaning the password is breached.
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 1);

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'breached',
        recaptchaToken: 'wrong',
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('Password found in breach database', 'password'));
  });

  test('Email already registered', async () => {
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      email: `george${randomUUID()}@example.com`,
      password: 'password!@#',
      recaptchaToken: 'xyz',
    };

    const res = await request(app).post('/auth/newuser').type('json').send(registerRequest);
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/auth/newuser').type('json').send(registerRequest);
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toBe('Email already registered');
  });

  test('Custom recaptcha client success', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const recaptchaSiteKey = 'recaptcha-site-key-' + randomUUID();
    const recaptchaSecretKey = 'recaptcha-secret-key-' + randomUUID();

    // Register and create a project
    const { project } = await registerNew({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
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
      defaultPatientAccessPolicy: {
        reference: 'AccessPolicy/' + randomUUID(),
      },
    });

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: project.id,
        firstName: 'Custom',
        lastName: 'Recaptcha',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaSiteKey,
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();
  });

  test('Custom recaptcha client with incorrect project ID', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const recaptchaSiteKey = 'recaptcha-site-key-' + randomUUID();
    const recaptchaSecretKey = 'recaptcha-secret-key-' + randomUUID();

    // Register and create a project
    const { project } = await registerNew({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
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
      defaultPatientAccessPolicy: {
        reference: 'AccessPolicy/' + randomUUID(),
      },
    });

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: randomUUID(),
        firstName: 'Custom',
        lastName: 'Recaptcha',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaSiteKey,
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toBe('Invalid recaptchaSiteKey');
  });

  test('Custom recaptcha client missing access policy', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const recaptchaSiteKey = 'recaptcha-site-key-' + randomUUID();
    const recaptchaSecretKey = 'recaptcha-secret-key-' + randomUUID();

    // Register and create a project
    const { project } = await registerNew({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
      email,
      password,
    });

    // As a super admin, set the recaptcha site key
    // but *not* the access policy
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

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: project.id,
        firstName: 'Custom',
        lastName: 'Recaptcha',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaSiteKey,
        recaptchaToken: 'xyz',
      });

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Project does not allow open registration');
  });

  test('Recaptcha site key not found', async () => {
    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Custom',
        lastName: 'Recaptcha',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaSiteKey: randomUUID(),
        recaptchaToken: 'xyz',
      });
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toBe('Invalid recaptchaSiteKey');
  });

  test('Recaptcha secret key not found', async () => {
    const email = `recaptcha-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const recaptchaSiteKey = 'recaptcha-site-key-' + randomUUID();

    // Register and create a project
    const { project } = await registerNew({
      firstName: 'Google',
      lastName: 'Google',
      projectName: 'Require Google Auth',
      email,
      password,
    });

    // As a super admin, set the recaptcha site key
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

    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: project.id,
        firstName: 'Custom',
        lastName: 'Recaptcha',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaSiteKey,
        recaptchaToken: 'xyz',
      });
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toBe('Invalid recaptchaSecretKey');
  });

  test('Isolated projects', async () => {
    // 1 email address, 3 scenarios
    // First, register a new project
    // Next, register as a patient in a different project
    // Third, register as a patient in a different project
    // All 3 of these should be isolated

    const email = `test${randomUUID()}@example.com`;
    const password = 'password!@#';

    // Project P1 is owned by the email address
    const reg1 = await registerNew({ firstName: 'P1', lastName: 'P1', projectName: 'P1', email, password });
    expect(reg1).toBeDefined();

    // Project P2 is owned by someone else
    const reg2 = await registerNew({
      firstName: 'P2',
      lastName: 'P2',
      projectName: 'P2',
      email: randomUUID(),
      password: randomUUID(),
    });
    expect(reg2).toBeDefined();

    // Project P3 is owned by someone else
    const reg3 = await registerNew({
      firstName: 'P3',
      lastName: 'P3',
      projectName: 'P3',
      email: randomUUID(),
      password: randomUUID(),
    });
    expect(reg3).toBeDefined();

    // Try to register as a patient in Project P2
    const res1 = await request(app).post('/auth/newuser').type('json').send({
      projectId: reg2.project.id,
      firstName: 'Isolated1',
      lastName: 'Isolated1',
      email,
      password,
      recaptchaToken: 'xyz',
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeUndefined();

    // Try to register as a patient in Project P2
    const res2 = await request(app).post('/auth/newuser').type('json').send({
      projectId: reg3.project.id,
      firstName: 'Isolated2',
      lastName: 'Isolated2',
      email,
      password,
      recaptchaToken: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.login).toBeDefined();
    expect(res2.body.code).toBeUndefined();
  });

  test('Success when config has empty recaptchaSecretKey and missing recaptcha token', async () => {
    getConfig().recaptchaSecretKey = '';
    const res = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
      });

    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();
  });
});
