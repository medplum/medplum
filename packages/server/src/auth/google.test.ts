import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { getUserByEmail } from '../oauth/utils';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

jest.mock('jose', () => {
  const original = jest.requireActual('jose');
  return {
    ...original,
    jwtVerify: jest.fn((credential: string) => {
      if (credential === 'invalid') {
        throw new Error('Verification failed');
      }
      return {
        // By convention for tests, return the credential as the email
        // Obviously in the real world the credential would be a JWT
        // And the Google Auth service returns the corresponding email
        payload: JSON.parse(credential),
      };
    }),
  };
});

const app = express();

describe('Google Auth', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing client ID', async () => {
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: '',
        googleCredential: createCredential('Admin', 'Admin', 'admin@example.com'),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing googleClientId');
  });

  test('Invalid client ID', async () => {
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: '123',
        googleCredential: createCredential('Admin', 'Admin', 'admin@example.com'),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Invalid googleClientId');
  });

  test('Missing googleCredential', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: getConfig().googleClientId,
      googleCredential: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing googleCredential');
  });

  test('Verification failed', async () => {
    const res = await request(app).post('/auth/google').type('json').send({
      googleClientId: getConfig().googleClientId,
      googleCredential: 'invalid',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Verification failed');
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: getConfig().googleClientId,
        googleCredential: createCredential('Admin', 'Admin', 'admin@example.com'),
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('Do not create user', async () => {
    const email = 'new-google-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: getConfig().googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
      });
    expect(res.status).toBe(400);

    const user = await getUserByEmail(email, undefined);
    expect(user).toBeUndefined();
  });

  test('Create new user account', async () => {
    const email = 'new-google-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: getConfig().googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
        createUser: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();

    const user = await getUserByEmail(email, undefined);
    expect(user).toBeDefined();
  });

  test('Create new user for new project', async () => {
    const email = 'new-google-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        projectId: 'new',
        googleClientId: getConfig().googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
        createUser: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
    expect(res.body.code).toBeUndefined();

    const user = await getUserByEmail(email, undefined);
    expect(user).toBeDefined();
  });

  test('Require Google auth', async () => {
    const email = `google${randomUUID()}@example.com`;
    const password = 'password!@#';

    // Register and create a project
    await withTestContext(async () => {
      const { project } = await registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      });

      // As a super admin, update the project to require Google auth
      const systemRepo = getSystemRepo();
      await systemRepo.updateResource({
        ...project,
        features: ['google-auth-required'],
      });
    });

    // Then try to login with Google auth
    // This should succeed
    const res2 = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: getConfig().googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
      });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Custom Google client success', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const googleClientId = 'google-client-id-' + randomUUID();

    await withTestContext(async () => {
      // Register and create a project
      const { project } = await registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      });

      // As a super admin, set the google client ID
      const systemRepo = getSystemRepo();
      await systemRepo.updateResource({
        ...project,
        site: [
          {
            name: 'Test Site',
            domain: ['example.com'],
            googleClientId,
          },
        ],
      });
    });

    // Try to login with the custom Google client
    // This should succeed
    const res2 = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
      });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Multiple projects same Google client success', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const googleClientId = 'google-client-id-' + randomUUID();

    await withTestContext(async () => {
      for (let i = 0; i < 2; i++) {
        // Register and create a project
        const { project } = await registerNew({
          firstName: 'Google',
          lastName: 'Google',
          projectName: 'Require Google Auth',
          email,
          password,
        });

        // As a super admin, set the google client ID
        const systemRepo = getSystemRepo();
        await systemRepo.updateResource({
          ...project,
          site: [
            {
              name: 'Test Site',
              domain: ['example.com'],
              googleClientId,
            },
          ],
        });
      }
    });

    // Try to login with the custom Google client
    // This should succeed
    const res2 = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        googleClientId: googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
      });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeUndefined();
    expect(res2.body.login).toBeDefined();
    expect(res2.body.memberships).toBeDefined();
    expect(res2.body.memberships).toHaveLength(2);
  });

  test('Custom Google client with project success', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const googleClientId = 'google-client-id-' + randomUUID();

    // Register and create a project
    const project = await withTestContext(async () => {
      const { project } = await registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      });

      // As a super admin, set the google client ID
      const systemRepo = getSystemRepo();
      await systemRepo.updateResource({
        ...project,
        site: [
          {
            name: 'Test Site',
            domain: ['example.com'],
            googleClientId,
          },
        ],
      });
      return project;
    });

    // Try to login with the custom Google client
    // This should succeed
    const res2 = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        projectId: project.id,
        googleClientId: googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
      });
    expect(res2.status).toBe(200);
  });

  test('Custom Google client wrong projectId', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';
    const googleClientId = 'google-client-id-' + randomUUID();

    // Register and create a project
    await withTestContext(async () => {
      const { project } = await registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      });

      // As a super admin, set the google client ID
      const systemRepo = getSystemRepo();
      await systemRepo.updateResource({
        ...project,
        site: [
          {
            name: 'Test Site',
            domain: ['example.com'],
            googleClientId,
          },
        ],
      });
    });

    // Try to login with the custom Google client
    // This should fail
    const res2 = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        projectId: randomUUID(),
        googleClientId: googleClientId,
        googleCredential: createCredential('Test', 'Test', email),
      });
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toEqual('Invalid googleClientId');
  });

  test('Custom OAuth client success', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { project, client } = await withTestContext(() =>
      registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      })
    );

    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        projectId: project.id,
        clientId: client.id,
        googleClientId: getConfig().googleClientId,
        googleCredential: createCredential('Text', 'User', email),
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('ClientId with incorrect projectId', async () => {
    const email = `google-client${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { client } = await withTestContext(() =>
      registerNew({
        firstName: 'Google',
        lastName: 'Google',
        projectName: 'Require Google Auth',
        email,
        password,
      })
    );

    const res = await request(app)
      .post('/auth/google')
      .type('json')
      .send({
        projectId: randomUUID(),
        clientId: client.id,
        googleClientId: getConfig().googleClientId,
        googleCredential: createCredential('Text', 'User', email),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Invalid projectId');
  });
});

function createCredential(firstName: string, lastName: string, email: string): string {
  return JSON.stringify({ given_name: firstName, family_name: lastName, email });
}
