import { randomUUID } from 'crypto';
import express from 'express';
import { authenticator } from 'otplib';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { registerNew } from './register';
import { withTestContext } from '../test.setup';

const app = express();

describe('MFA', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Enroll end-to-end', async () => {
    const email = `alex${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email,
        password,
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      })
    );

    // Try to enroll before ever getting status, should fail
    const res1 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate('1234567890') });
    expect(res1.status).toBe(400);
    expect(res1.body.issue[0].details.text).toBe('Secret not found');

    // Start new login
    const res2 = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      scope: 'openid',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.login).toBeDefined();

    // Try to verify before enrolling, should fail
    const res3 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ login: res2.body.login, token: authenticator.generate('1234567890') });
    expect(res3.status).toBe(400);
    expect(res3.body.issue[0].details.text).toBe('User not enrolled in MFA');

    // Get MFA status, should be disabled
    const res4 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res4.status).toBe(200);
    expect(res4.body).toBeDefined();
    expect(res4.body.enrolled).toBe(false);
    expect(res4.body.enrollUri).toBeDefined();

    const secret = new URL(res4.body.enrollUri).searchParams.get('secret') as string;

    // Get MFA status again, should be the same enroll URI
    const res5 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res5.status).toBe(200);
    expect(res5.body).toBeDefined();
    expect(res5.body.enrollUri).toBe(res4.body.enrollUri);

    // Try to enroll with invalid token, should fail
    const res6 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: '1234567890' });
    expect(res6.status).toBe(400);
    expect(res6.body.issue[0].details.text).toBe('Invalid token');

    // Enroll MFA
    const res7 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate(secret) });
    expect(res7.status).toBe(200);

    // Try to enroll again, should fail
    const res8 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate(secret) });
    expect(res8.status).toBe(400);
    expect(res8.body.issue[0].details.text).toBe('Already enrolled');

    // Get MFA status, should be enrolled
    const res9 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res9.status).toBe(200);
    expect(res9.body).toBeDefined();
    expect(res9.body.enrolled).toBe(true);

    // Start new login
    const res10 = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      scope: 'openid',
    });
    expect(res10.status).toBe(200);
    expect(res10.body.login).toBeDefined();
    expect(res10.body.code).not.toBeDefined();

    // Verify without token, should fail
    const res11 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ login: res10.body.login, token: '' });
    expect(res11.status).toBe(400);
    expect(res11.body.issue[0].details.text).toBe('Missing token');

    // Verify with invalid token, should fail
    const res12 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ login: res10.body.login, token: '1234567890' });
    expect(res12.status).toBe(400);
    expect(res12.body.issue[0].details.text).toBe('Invalid MFA token');

    // Verify MFA success
    const res13 = await request(app)
      .post('/auth/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ login: res10.body.login, token: authenticator.generate(secret) });
    expect(res13.status).toBe(200);
    expect(res13.body.login).toBeDefined();
    expect(res13.body.code).toBeDefined();
  });
});
