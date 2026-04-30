// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Login, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { authenticator } from 'otplib';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

describe('Scope', () => {
  const app = express();
  const systemRepo = getGlobalSystemRepo();
  const email = `multi${randomUUID()}@example.com`;
  const password = randomUUID();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    await withTestContext(() =>
      registerNew({
        firstName: 'Scope',
        lastName: 'Scope',
        projectName: 'Scope Project',
        email,
        password,
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing login', async () => {
    const res = await request(app).post('/auth/scope').type('json').send({
      scope: 'openid profile',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing login');
  });

  test('Missing scope', async () => {
    const res = await request(app).post('/auth/scope').type('json').send({
      login: '123',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing scope');
  });

  test('Login not found', async () => {
    const res = await request(app).post('/auth/scope').type('json').send({
      login: randomUUID(),
      scope: 'openid profile',
    });
    expect(res.status).toBe(404);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Not found');
  });

  test('Login revoked', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();

    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
    await withTestContext(() =>
      systemRepo.updateResource({
        ...login,
        revoked: true,
      })
    );

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Login revoked');
  });

  test('Login granted', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();

    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
    await withTestContext(() =>
      systemRepo.updateResource({
        ...login,
        granted: true,
      })
    );

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Login granted');
  });

  test('Success', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Invalid scope', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile patient/Condition.rs?category=health-concern',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Invalid scope');
  });

  test('Allow selection of restricted scopes', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile patient/Condition.crs',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile patient/Condition.read', // V1 scope is equivalent to `rs`, a subset of the one above
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Allow selection of more granular scope', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile patient/Condition.rs',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile patient/Condition.rs?category=health-concern',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Disallow selection of conflicting granular scope', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile patient/Condition.rs?encounter=Encounter/1',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile patient/Condition.rs?category=health-concern',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Invalid scope');
  });

  describe('MFA-pending login', () => {
    const mfaEmail = `mfa${randomUUID()}@example.com`;
    const mfaPassword = randomUUID();
    let mfaSecret: string;

    beforeAll(async () => {
      const registration = await withTestContext(() =>
        registerNew({
          firstName: 'MFA',
          lastName: 'User',
          projectName: 'MFA Scope Project',
          email: mfaEmail,
          password: mfaPassword,
        })
      );

      // Enroll MFA directly on the user record so future logins require verification.
      mfaSecret = authenticator.generateSecret();
      await withTestContext(() =>
        systemRepo.updateResource<User>({
          ...registration.user,
          mfaEnrolled: true,
          mfaSecret,
        })
      );
    });

    test('Does not leak auth code when MFA is enrolled but not verified', async () => {
      const loginRes = await request(app).post('/auth/login').type('json').send({
        scope: 'openid profile',
        email: mfaEmail,
        password: mfaPassword,
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.login).toBeDefined();
      expect(loginRes.body.mfaRequired).toBe(true);
      expect(loginRes.body.code).toBeUndefined();

      const scopeRes = await request(app).post('/auth/scope').type('json').send({
        login: loginRes.body.login,
        scope: 'openid profile',
      });
      expect(scopeRes.status).toBe(200);
      expect(scopeRes.body.mfaRequired).toBe(true);
      expect(scopeRes.body.code).toBeUndefined();
    });

    test('Releases auth code once MFA is verified', async () => {
      const loginRes = await request(app).post('/auth/login').type('json').send({
        scope: 'openid profile',
        email: mfaEmail,
        password: mfaPassword,
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.mfaRequired).toBe(true);

      const mfaRes = await request(app)
        .post('/auth/mfa/verify')
        .type('json')
        .send({
          login: loginRes.body.login,
          token: authenticator.generate(mfaSecret),
        });
      expect(mfaRes.status).toBe(200);
      expect(mfaRes.body.code).toBeDefined();

      const scopeRes = await request(app).post('/auth/scope').type('json').send({
        login: loginRes.body.login,
        scope: 'openid profile',
      });
      expect(scopeRes.status).toBe(200);
      expect(scopeRes.body.code).toBeDefined();
      expect(scopeRes.body.mfaRequired).toBeUndefined();
    });
  });
});
