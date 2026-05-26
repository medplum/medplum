// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { WithId } from '@medplum/core';
import { allOk, badRequest } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { simpleParser } from 'mailparser';
import { authenticator } from 'otplib';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

jest.mock('@aws-sdk/client-sesv2');

const app = express();

/**
 * Sets the `allowedMfaMethods` project setting so email-based MFA enrollment is offered.
 * @param project - The project to update.
 * @param value - The comma-delimited list of allowed methods.
 */
async function setAllowedMfaMethods(project: WithId<Project>, value: string): Promise<void> {
  const systemRepo = getGlobalSystemRepo();
  await withTestContext(() =>
    systemRepo.updateResource<Project>({
      ...project,
      setting: [...(project.setting ?? []), { name: 'allowedMfaMethods', valueString: value }],
    })
  );
}

/**
 * Extracts the 6-digit verification code from the most recent MFA email.
 * @returns The verification code emailed to the user.
 */
async function getCodeFromEmail(): Promise<string> {
  const calls = (SendEmailCommand as unknown as jest.Mock).mock.calls;
  const args = calls[calls.length - 1][0];
  const parsed = await simpleParser(args.Content.Raw.Data);
  const match = /\b(\d{6})\b/.exec(parsed.text as string);
  if (!match) {
    throw new Error('No verification code found in email: ' + parsed.text);
  }
  return match[1];
}

describe('MFA', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
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

  test('Disable end-to-end', async () => {
    const email = `alex${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alexander',
        lastName: 'The Great',
        projectName: 'Macedonian Project',
        email,
        password,
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      })
    );

    // Call disable while not enrolled yet and before status, should error
    const res1 = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({
        token: '123',
      });
    expect(res1.status).toBe(400);
    expect(res1.body).toMatchObject(badRequest('User not enrolled in MFA'));

    // Get status; should not be enrolled and should get a secret
    const res2 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body.enrolled).toBe(false);
    expect(res2.body).toBeDefined();
    expect(res2.body.enrollUri).toBeDefined();

    // Start new login
    const res3 = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      scope: 'openid',
    });
    expect(res3.status).toBe(200);
    expect(res3.body.login).toBeDefined();

    // Get MFA status, should be disabled
    const res4 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res4.status).toBe(200);
    expect(res4.body).toBeDefined();
    expect(res4.body.enrolled).toBe(false);
    expect(res4.body.enrollUri).toBeDefined();

    const secret = new URL(res4.body.enrollUri).searchParams.get('secret') as string;

    // Enroll MFA
    const res5 = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate(secret) });
    expect(res5.status).toBe(200);

    // Call disable without token, should fail
    const res6 = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json');
    expect(res6.status).toBe(400);
    expect(res6.body).toMatchObject(badRequest('Missing token'));

    // Call disable with invalid token, should fail
    const res7 = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: 'invalid' });
    expect(res7.status).toBe(400);
    expect(res7.body).toMatchObject(badRequest('Invalid token'));

    // Call disable with token, should succeed
    const res8 = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: authenticator.generate(secret) });
    expect(res8.status).toBe(200);
    expect(res8.body).toMatchObject(allOk);

    // Get status should not be enrolled and should have a new secret
    const res9 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(res9.status).toBe(200);
    expect(res9.body.enrolled).toBe(false);
    expect(res9.body).toBeDefined();
    expect(res9.body.enrollUri).not.toBe(res4.body.enrollUri);

    const secret2 = new URL(res9.body.enrollUri).searchParams.get('secret') as string;

    // Call disable while no longer enrolled, should error
    const res10 = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({
        token: authenticator.generate(secret2),
      });
    expect(res10.status).toBe(400);
    expect(res10.body).toMatchObject(badRequest('User not enrolled in MFA'));
  });

  test('Email MFA not allowed by project', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'Disabled',
        projectName: `Email MFA Disabled ${randomUUID()}`,
        email,
        password,
      })
    );

    // Project has no allowedMfaMethods setting, so only TOTP is allowed
    const res = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('MFA method not allowed'));
  });

  test('Email MFA enroll and login end-to-end', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'User',
        projectName: `Email MFA Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');

    // Status should advertise email as an allowed (but not yet enrolled) method
    const statusRes = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.enrolled).toBe(false);
    expect(statusRes.body.allowedMethods).toEqual(expect.arrayContaining(['totp', 'email']));

    // Enroll in email-based MFA (no token required)
    const enrollRes = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });
    expect(enrollRes.status).toBe(200);
    expect(enrollRes.body).toMatchObject(allOk);

    // Status should now report email enrollment
    const status2 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status2.status).toBe(200);
    expect(status2.body.enrolled).toBe(true);
    expect(status2.body.enrolledMethods).toEqual(['email']);

    // Logging in should require MFA and email a verification code automatically
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.login).toBeDefined();
    expect(loginRes.body.code).not.toBeDefined();
    expect(loginRes.body.mfaRequired).toBe(true);
    expect(loginRes.body.mfaMethods).toEqual(['email']);
    expect(loginRes.body.email).toBe(email);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const code = await getCodeFromEmail();
    expect(code).toMatch(/^\d{6}$/);

    // A wrong code should fail
    const badVerify = await request(app)
      .post('/auth/mfa/verify')
      .type('json')
      .send({ login: loginRes.body.login, token: '000000' === code ? '111111' : '000000' });
    expect(badVerify.status).toBe(400);

    // Verifying with the emailed code completes the login
    const verifyRes = await request(app)
      .post('/auth/mfa/verify')
      .type('json')
      .send({ login: loginRes.body.login, token: code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.code).toBeDefined();
  });

  test('Enroll in both TOTP and email; login defaults to TOTP with email fallback', async () => {
    const email = `both-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Both',
        lastName: 'Methods',
        projectName: `Both MFA Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');

    // Get a TOTP secret, then enroll in TOTP
    const statusRes = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    const totpSecret = new URL(statusRes.body.enrollUri).searchParams.get('secret') as string;

    const enrollTotp = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: authenticator.generate(totpSecret) });
    expect(enrollTotp.status).toBe(200);

    // Add email as a second method
    const enrollEmail = await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });
    expect(enrollEmail.status).toBe(200);

    const status2 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status2.body.enrolledMethods).toEqual(expect.arrayContaining(['totp', 'email']));

    // Login should require MFA and report both methods, WITHOUT auto-sending an email
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.mfaRequired).toBe(true);
    expect(loginRes.body.mfaMethods).toEqual(expect.arrayContaining(['totp', 'email']));
    expect(SendEmailCommand).not.toHaveBeenCalled();

    // The user can verify with their TOTP code
    const totpVerify = await request(app)
      .post('/auth/mfa/verify')
      .type('json')
      .send({ login: loginRes.body.login, token: authenticator.generate(totpSecret) });
    expect(totpVerify.status).toBe(200);
    expect(totpVerify.body.code).toBeDefined();
  });

  test('Switch to email code via send-email endpoint', async () => {
    const email = `both-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Switch',
        lastName: 'Methods',
        projectName: `Switch MFA Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');

    const statusRes = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    const totpSecret = new URL(statusRes.body.enrollUri).searchParams.get('secret') as string;
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: authenticator.generate(totpSecret) });
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });

    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.body.mfaRequired).toBe(true);

    // Request a verification code to use email instead of TOTP
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    const sendRes = await request(app).post('/auth/mfa/send-email').type('json').send({ login: loginRes.body.login });
    expect(sendRes.status).toBe(200);
    expect(sendRes.body).toMatchObject(allOk);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const code = await getCodeFromEmail();

    const verifyRes = await request(app)
      .post('/auth/mfa/verify')
      .type('json')
      .send({ login: loginRes.body.login, token: code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.code).toBeDefined();
  });

  test('Disable email-only MFA without a token', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'Disable',
        projectName: `Email Disable Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');

    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });

    // Email-only users have no authenticator code, so disable does not require a token
    const disableRes = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(disableRes.status).toBe(200);
    expect(disableRes.body).toMatchObject(allOk);

    const status = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status.body.enrolled).toBe(false);
  });
});
