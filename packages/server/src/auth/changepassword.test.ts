import { badRequest } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';
import { registerNew } from './register';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Change Password', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Success', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: 'password!@#',
        newPassword: 'password!@#123',
      });

    expect(res2.status).toBe(200);
  });

  test('Missing old password', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: '',
        newPassword: 'password!@#123',
      });

    expect(res2.status).toBe(400);
  });

  test('Incorrect old password', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: 'foobarbang',
        newPassword: 'password!@#123',
      });

    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject(badRequest('Incorrect password', 'oldPassword'));
  });

  test('Breached password', async () => {
    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Thomas',
        lastName: 'Jefferson',
        projectName: 'Jefferson Project',
        email: `thomas${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Mock the pwnedPassword function to return "1", meaning the password is breached.
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 1);

    const res2 = await request(app)
      .post('/auth/changepassword')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        oldPassword: 'password!@#',
        newPassword: 'breached',
      });

    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject(badRequest('Password found in breach database', 'newPassword'));
  });
});
