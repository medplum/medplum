// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { WithId } from '@medplum/core';
import { allOk, badRequest } from '@medplum/core';
import type { Login, Project, Reference, User } from '@medplum/fhirtypes';
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

  test('Verifying email code marks the user emailVerified', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'Verified',
        projectName: `Email Verified Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'email');
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });

    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.body.mfaRequired).toBe(true);

    const systemRepo = getGlobalSystemRepo();
    const login = await systemRepo.readResource<Login>('Login', loginRes.body.login);

    // The user should not be email-verified before entering the code
    const userBefore = await systemRepo.readReference<User>(login.user as Reference<User>);
    expect(userBefore.emailVerified).toBeFalsy();

    const code = await getCodeFromEmail();
    const verifyRes = await request(app)
      .post('/auth/mfa/verify')
      .type('json')
      .send({ login: loginRes.body.login, token: code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.code).toBeDefined();

    // Entering the emailed code proves the user controls the email address
    const userAfter = await systemRepo.readReference<User>(login.user as Reference<User>);
    expect(userAfter.emailVerified).toBe(true);
  });

  test('Expired email code is rejected', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'Expired',
        projectName: `Email Expired Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'email');
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });

    // Login emails a verification code automatically
    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.body.mfaRequired).toBe(true);
    const code = await getCodeFromEmail();

    // Force the code to be expired
    const systemRepo = getGlobalSystemRepo();
    await withTestContext(async () => {
      const login = await systemRepo.readResource<Login>('Login', loginRes.body.login);
      await systemRepo.updateResource<Login>({
        ...login,
        emailMfa: { ...login.emailMfa, expiresAt: new Date(Date.now() - 1000).toISOString() } as Login['emailMfa'],
      });
    });

    // Even the correct code is rejected once expired
    const verifyRes = await request(app)
      .post('/auth/mfa/verify')
      .type('json')
      .send({ login: loginRes.body.login, token: code });
    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body).toMatchObject(badRequest('MFA code expired'));
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

  test('send-email requires a login', async () => {
    const res = await request(app).post('/auth/mfa/send-email').type('json').send({});
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Missing login');
  });

  test('send-email rejects a revoked login', async () => {
    const email = `both-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Revoked',
        lastName: 'Login',
        projectName: `Revoked Login Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');
    await enrollBothMethods(accessToken);

    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.body.mfaRequired).toBe(true);

    const systemRepo = getGlobalSystemRepo();
    await withTestContext(async () => {
      const login = await systemRepo.readResource<Login>('Login', loginRes.body.login);
      await systemRepo.updateResource<Login>({ ...login, revoked: true });
    });

    const res = await request(app).post('/auth/mfa/send-email').type('json').send({ login: loginRes.body.login });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('Login revoked'));
  });

  test('send-email rejects a granted login', async () => {
    const email = `both-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Granted',
        lastName: 'Login',
        projectName: `Granted Login Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');
    await enrollBothMethods(accessToken);

    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.body.mfaRequired).toBe(true);

    const systemRepo = getGlobalSystemRepo();
    await withTestContext(async () => {
      const login = await systemRepo.readResource<Login>('Login', loginRes.body.login);
      await systemRepo.updateResource<Login>({ ...login, granted: true });
    });

    const res = await request(app).post('/auth/mfa/send-email').type('json').send({ login: loginRes.body.login });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('Login granted'));
  });

  test('send-email rejects an already-verified login', async () => {
    const email = `both-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Verified',
        lastName: 'Login',
        projectName: `Verified Login Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');
    await enrollBothMethods(accessToken);

    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.body.mfaRequired).toBe(true);

    const systemRepo = getGlobalSystemRepo();
    await withTestContext(async () => {
      const login = await systemRepo.readResource<Login>('Login', loginRes.body.login);
      await systemRepo.updateResource<Login>({ ...login, mfaVerified: true });
    });

    const res = await request(app).post('/auth/mfa/send-email').type('json').send({ login: loginRes.body.login });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('Login already verified'));
  });

  test('send-email requires email enrollment', async () => {
    const email = `totp-only${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Totp',
        lastName: 'Only',
        projectName: `Totp Only Project ${randomUUID()}`,
        email,
        password,
      })
    );

    // Enroll in TOTP only, so the user has MFA but not the email method
    const statusRes = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    const secret = new URL(statusRes.body.enrollUri).searchParams.get('secret') as string;
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: authenticator.generate(secret) });

    const loginRes = await request(app).post('/auth/login').type('json').send({ email, password, scope: 'openid' });
    expect(loginRes.body.mfaRequired).toBe(true);

    const res = await request(app).post('/auth/mfa/send-email').type('json').send({ login: loginRes.body.login });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('User not enrolled in email MFA'));
  });

  test('Disable email-only MFA requires an emailed code', async () => {
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

    // Disabling now requires proving control of a connected factor
    const noToken = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(noToken.status).toBe(400);
    expect(noToken.body).toMatchObject(badRequest('Missing token'));

    // Request an emailed verification code
    const challengeRes = await request(app)
      .post('/auth/mfa/send-email-challenge')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(challengeRes.status).toBe(200);
    const code = await getCodeFromEmail();

    // A wrong code is rejected
    const wrongCode = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: '000000' });
    expect(wrongCode.status).toBe(400);
    expect(wrongCode.body).toMatchObject(badRequest('Invalid token'));

    // The emailed code disables MFA
    const disableRes = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: code });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body).toMatchObject(allOk);

    const status = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status.body.enrolled).toBe(false);
  });

  test('send-email-challenge requires email enrollment', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'NoEmailMfa',
        projectName: `No Email MFA Project ${randomUUID()}`,
        email,
        password,
      })
    );

    // Enroll in TOTP only
    const statusRes = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    const secret = new URL(statusRes.body.enrollUri).searchParams.get('secret') as string;
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: authenticator.generate(secret) });

    const res = await request(app)
      .post('/auth/mfa/send-email-challenge')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('User not enrolled in email MFA'));
  });

  /**
   * Enrolls the user (identified by `accessToken`) in both TOTP and email MFA.
   * @param accessToken - The user's access token.
   * @returns The authenticator secret, for generating TOTP tokens.
   */
  async function enrollBothMethods(accessToken: string): Promise<string> {
    const statusRes = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    const secret = new URL(statusRes.body.enrollUri).searchParams.get('secret') as string;

    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: authenticator.generate(secret) });

    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });

    return secret;
  }

  test('Remove a single factor keeps the others', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'RemoveOne',
        projectName: `Remove One Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');
    const secret = await enrollBothMethods(accessToken);

    // Both methods are enrolled
    const status1 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status1.body.enrolled).toBe(true);
    expect(status1.body.enrolledMethods).toEqual(expect.arrayContaining(['totp', 'email']));

    // Removing a factor requires proving control of a connected factor
    const noToken = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email' });
    expect(noToken.status).toBe(400);
    expect(noToken.body).toMatchObject(badRequest('Missing token'));

    // Remove the email factor
    const removeRes = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email', token: authenticator.generate(secret) });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body).toMatchObject(allOk);

    // Still enrolled, but only in TOTP now
    const status2 = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status2.body.enrolled).toBe(true);
    expect(status2.body.enrolledMethods).toEqual(['totp']);
  });

  test('Removing TOTP regenerates the secret and keeps email', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'RemoveTotp',
        projectName: `Remove Totp Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');
    const secret = await enrollBothMethods(accessToken);

    const removeRes = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: authenticator.generate(secret) });
    expect(removeRes.status).toBe(200);

    // Still enrolled in email; the authenticator secret was rotated
    const status = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status.body.enrolled).toBe(true);
    expect(status.body.enrolledMethods).toEqual(['email']);
    expect(new URL(status.body.enrollUri).searchParams.get('secret')).not.toBe(secret);
  });

  test('Removing the last factor disables MFA', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'RemoveLast',
        projectName: `Remove Last Project ${randomUUID()}`,
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

    // Email is the only connected factor, so verify with an emailed code
    await request(app)
      .post('/auth/mfa/send-email-challenge')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    const code = await getCodeFromEmail();

    const removeRes = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email', token: code });
    expect(removeRes.status).toBe(200);

    const status = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status.body.enrolled).toBe(false);
    expect(status.body.enrolledMethods).toEqual([]);
  });

  test('A connected factor can be removed using the emailed code', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'RemoveViaEmail',
        projectName: `Remove Via Email Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');
    await enrollBothMethods(accessToken);

    // Verify with the emailed code instead of the authenticator, then remove TOTP
    await request(app)
      .post('/auth/mfa/send-email-challenge')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    const code = await getCodeFromEmail();

    const removeRes = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: code });
    expect(removeRes.status).toBe(200);

    const status = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    expect(status.body.enrolled).toBe(true);
    expect(status.body.enrolledMethods).toEqual(['email']);

    // The emailed code is single-use; a second disable attempt with it fails
    const reuse = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ token: code });
    expect(reuse.status).toBe(400);
    expect(reuse.body).toMatchObject(badRequest('Invalid token'));
  });

  test('Removing an invalid method fails', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken, project } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'RemoveInvalid',
        projectName: `Remove Invalid Project ${randomUUID()}`,
        email,
        password,
      })
    );

    await setAllowedMfaMethods(project, 'totp,email');
    const secret = await enrollBothMethods(accessToken);

    const badMethod = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'sms', token: authenticator.generate(secret) });
    expect(badMethod.status).toBe(400);
    expect(badMethod.body).toMatchObject(badRequest('Invalid method'));
  });

  test('Removing a method the user is not enrolled in fails', async () => {
    const email = `email-mfa${randomUUID()}@example.com`;
    const password = 'password!@#';

    const { accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Email',
        lastName: 'RemoveUnenrolled',
        projectName: `Remove Unenrolled Project ${randomUUID()}`,
        email,
        password,
      })
    );

    // Enroll in TOTP only
    const statusRes = await request(app).get('/auth/mfa/status').set('Authorization', `Bearer ${accessToken}`);
    const secret = new URL(statusRes.body.enrollUri).searchParams.get('secret') as string;
    await request(app)
      .post('/auth/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'totp', token: authenticator.generate(secret) });

    const res = await request(app)
      .post('/auth/mfa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ method: 'email', token: authenticator.generate(secret) });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(badRequest('User not enrolled in MFA method'));
  });
});
