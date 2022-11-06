import { allOk } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import { authenticator } from 'otplib';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';
import { registerNew } from './register';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('MFA', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Enroll end-to-end', async () => {
    const { accessToken } = await registerNew({
      firstName: 'Alexander',
      lastName: 'Hamilton',
      projectName: 'Hamilton Project',
      email: `alex${randomUUID()}@example.com`,
      password: 'password!@#',
      remoteAddress: '5.5.5.5',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
    });

    // Try to enroll before ever getting status, should fail
    const res1 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate('1234567890') });
    expect(res1.status).toBe(400);
    expect(res1.body.issue[0].details.text).toBe('Secret not found');

    // Try to verify before enrolling, should fail
    const res2 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate('1234567890') });
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toBe('Not enrolled');

    // Get MFA status, should be disabled
    const res3 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res3.status).toBe(200);
    expect(res3.body).toBeDefined();
    expect(res3.body.enrolled).toBe(false);
    expect(res3.body.enrollUri).toBeDefined();

    const secret = new URL(res3.body.enrollUri).searchParams.get('secret') as string;

    // Get MFA status again, should be the same enroll URI
    const res4 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res4.status).toBe(200);
    expect(res4.body).toBeDefined();
    expect(res4.body.enrollUri).toBe(res3.body.enrollUri);

    // Try to enroll with invalid token, should fail
    const res5 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: '1234567890' });
    expect(res5.status).toBe(400);
    expect(res5.body.issue[0].details.text).toBe('Invalid token');

    // Enroll MFA
    const res6 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate(secret) });
    expect(res6.status).toBe(200);

    // Try to enroll again, should fail
    const res7 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate(secret) });
    expect(res7.status).toBe(400);
    expect(res7.body.issue[0].details.text).toBe('Already enrolled');

    // Get MFA status, should be enrolled
    const res8 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res8.status).toBe(200);
    expect(res8.body).toBeDefined();
    expect(res8.body.enrolled).toBe(true);

    // Verify MFA
    const res9 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate(secret) });
    expect(res9.status).toBe(200);
    expect(res9.body).toMatchObject(allOk);

    // Verify without token, should fail
    const res10 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: '' });
    expect(res10.status).toBe(400);
    expect(res10.body.issue[0].details.text).toBe('Missing token');

    // Verify with invalid token, should fail
    const res11 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: '1234567890' });
    expect(res11.status).toBe(400);
    expect(res11.body.issue[0].details.text).toBe('Invalid token');
  });
});
