// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { getUserByEmail } from '../oauth/utils';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

jest.mock('jose', () => {
  const original = jest.requireActual('jose');
  return {
    ...original,
    jwtVerify: jest.fn().mockImplementation((idToken) => {
      if (idToken === 'invalid') {
        throw new Error('Invalid Apple ID token');
      }
      return {
        // By convention for tests, return the credential as parsed Apple JWT claims
        // In real world, this would be Apple's JWT verification
        payload: JSON.parse(idToken),
      };
    }),
    createRemoteJWKSet: jest.fn().mockReturnValue({}), // Mock the JWKS
  };
});

const app = express();

describe('Apple Auth', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  beforeEach(() => {
    getConfig().registerEnabled = undefined;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing ID token', async () => {
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing ID token');
  });

  test('Missing client ID', async () => {
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        idToken: createAppleIdToken('test@example.com'),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Apple client ID not configured');
  });

  test('Invalid ID token', async () => {
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        idToken: 'invalid',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Invalid Apple ID token');
  });

  test('Missing email in token', async () => {
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        idToken: createAppleIdToken(undefined), // No email
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Email not provided by Apple');
  });

  test('User not found without createUser flag', async () => {
    const email = 'nonexistent-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        idToken: createAppleIdToken(email),
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Success with existing user', async () => {
    // Create a user first
    const email = 'apple-' + randomUUID() + '@example.com';
    await withTestContext(() =>
      registerNew({
        firstName: 'Apple',
        lastName: 'User',
        projectName: 'Apple Test Project',
        email,
        password: 'password!@#',
      })
    );

    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        idToken: createAppleIdToken(email),
        scope: 'openid offline',
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
  });

  test('Create new user with Apple ID', async () => {
    const email = 'new-apple-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        idToken: createAppleIdToken(email),
        createUser: true,
        user: {
          name: {
            firstName: 'Apple',
            lastName: 'TestUser'
          }
        },
        projectId: 'new',
        scope: 'openid offline'
      });
    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();

    const user = await getUserByEmail(email, undefined);
    expect(user).toBeDefined();
    expect(user?.firstName).toBe('Apple');
    expect(user?.lastName).toBe('TestUser');
  });

  test('Register disabled', async () => {
    getConfig().registerEnabled = false;
    const email = 'new-apple-' + randomUUID() + '@example.com';
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        idToken: createAppleIdToken(email),
        createUser: true,
        user: {
          name: {
            firstName: 'Test',
            lastName: 'User'
          }
        },
        projectId: 'new',
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Registration is disabled');

    const user = await getUserByEmail(email, undefined);
    expect(user).toBeUndefined();
  });

  test('Success with project ID', async () => {
    const email = 'apple-project-' + randomUUID() + '@example.com';

    const { project } = await withTestContext(() =>
      registerNew({
        firstName: 'Project',
        lastName: 'Admin',
        projectName: 'Apple Project Test',
        email: 'admin-' + randomUUID() + '@example.com',
        password: 'password!@#',
      })
    );

    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        projectId: project.id,
        idToken: createAppleIdToken(email),
        createUser: true,
        user: {
          name: {
            firstName: 'Apple',
            lastName: 'ProjectUser'
          }
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.login).toBeDefined();
  });

  test('Invalid user object format', async () => {
    const res = await request(app)
      .post('/auth/apple')
      .type('json')
      .send({
        clientId: 'com.example.app',
        idToken: createAppleIdToken('test@example.com'),
        user: 'invalid-user-format', // Should be object
      });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Invalid user object');
  });
});

function createAppleIdToken(email: string | undefined): string {
  return JSON.stringify({
    iss: 'https://appleid.apple.com',
    aud: 'com.example.app',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    sub: 'apple-user-' + randomUUID(),
    email,
    email_verified: true,
    is_private_email: false,
    real_user_status: 2,
  });
}