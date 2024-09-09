import { badRequest } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';
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

  beforeEach(() => {
    getConfig().registerEnabled = undefined;
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
        projectId: 'new',
      });

    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();
  });

  test('Register disabled', async () => {
    getConfig().registerEnabled = false;
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

    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Registration is disabled');
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

  test('Password too short', async () => {
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      email: `george${randomUUID()}@example.com`,
      password: 'xyz',
      recaptchaToken: 'xyz',
    };

    const res = await request(app).post('/auth/newuser').type('json').send(registerRequest);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Password must be between 8 and 72 characters');
  });

  test('Password too long', async () => {
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      email: `george${randomUUID()}@example.com`,
      password: 'xyz'.repeat(100),
      recaptchaToken: 'xyz',
    };

    const res = await request(app).post('/auth/newuser').type('json').send(registerRequest);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Password must be between 8 and 72 characters');
  });

  test('Multibyte password too long', async () => {
    // Use password with 40 multibyte characters
    // This is 80 bytes, which is too long
    // The maximum password length for bcrypt is 72 bytes
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      email: `george${randomUUID()}@example.com`,
      password: '☺️'.repeat(40),
      recaptchaToken: 'xyz',
    };

    const res = await request(app).post('/auth/newuser').type('json').send(registerRequest);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Password must be between 8 and 72 characters');
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

    const project = await withTestContext(async () => {
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
      const systemRepo = getSystemRepo();
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
      return project;
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
    await withTestContext(async () => {
      const { project } = await registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      });
      // As a super admin, set the recaptcha site key
      // and the default access policy
      const systemRepo = getSystemRepo();
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
      return project;
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
    const project = await withTestContext(async () => {
      const { project } = await registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      });
      // As a super admin, set the recaptcha site key
      // but *not* the access policy
      const systemRepo = getSystemRepo();
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
    const project = await withTestContext(async () => {
      const { project } = await registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      });
      // As a super admin, set the recaptcha site key
      const systemRepo = getSystemRepo();
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
    const reg1 = await withTestContext(() =>
      registerNew({ firstName: 'P1', lastName: 'P1', projectName: 'P1', email, password })
    );
    expect(reg1).toBeDefined();

    // Project P2 is owned by someone else
    const reg2 = await withTestContext(() =>
      registerNew({
        firstName: 'P2',
        lastName: 'P2',
        projectName: 'P2',
        email: `test${randomUUID()}@example.com`,
        password: randomUUID(),
      })
    );
    expect(reg2).toBeDefined();

    // Project P3 is owned by someone else
    const reg3 = await withTestContext(() =>
      registerNew({
        firstName: 'P3',
        lastName: 'P3',
        projectName: 'P3',
        email: `test${randomUUID()}@example.com`,
        password: randomUUID(),
      })
    );
    expect(reg3).toBeDefined();

    // Try to register as a patient in Project P2
    const res1 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: reg2.project.id,
        firstName: 'Isolated1',
        lastName: 'Isolated1',
        email: `test${randomUUID()}@example.com`,
        password,
        recaptchaToken: 'xyz',
      });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeUndefined();

    // Try to register as a patient in Project P3
    const res2 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: reg3.project.id,
        firstName: 'Isolated2',
        lastName: 'Isolated2',
        email: `test${randomUUID()}@example.com`,
        password,
        recaptchaToken: 'xyz',
      });
    expect(res2.status).toBe(200);
    expect(res2.body.login).toBeDefined();
    expect(res2.body.code).toBeUndefined();

    // Try to register with a valid projectId and clientId
    const res3 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: reg2.project.id,
        clientId: reg2.client.id,
        firstName: 'Isolated3',
        lastName: 'Isolated3',
        email: `test${randomUUID()}@example.com`,
        password,
        recaptchaToken: 'xyz',
      });
    expect(res3.status).toBe(200);
    expect(res3.body.login).toBeDefined();
    expect(res3.body.code).toBeUndefined();

    // Try to register with an invalid projectId and clientId pair
    const res4 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId: reg2.project.id,
        clientId: reg3.client.id,
        firstName: 'Isolated4',
        lastName: 'Isolated4',
        email: `test${randomUUID()}@example.com`,
        password,
        recaptchaToken: 'xyz',
      });
    expect(res4.status).toBe(400);
    expect(res4.body.login).toBeUndefined();
    expect(res4.body.code).toBeUndefined();
    expect(res4.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: {
            text: 'Client and project do not match',
          },
        },
      ],
    });

    // Try to register with only a clientId
    const res5 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        clientId: reg2.client.id,
        firstName: 'Isolated5',
        lastName: 'Isolated5',
        email: `test${randomUUID()}@example.com`,
        password,
        recaptchaToken: 'xyz',
      });
    expect(res5.status).toBe(200);
    expect(res5.body.login).toBeDefined();
    expect(res5.body.code).toBeUndefined();

    // Try to register with an invalid clientId
    const res6 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        clientId: randomUUID(),
        firstName: 'Isolated6',
        lastName: 'Isolated6',
        email: `test${randomUUID()}@example.com`,
        password,
        recaptchaToken: 'xyz',
      });
    expect(res6.status).toBe(404);
    expect(res6.body.login).toBeUndefined();
    expect(res6.body.code).toBeUndefined();
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
