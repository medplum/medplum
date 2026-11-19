// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { ClientApplication, Login, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { setPassword } from '../auth/setpassword';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { generateAccessToken } from './keys';

describe('OAuth2 UserInfo', () => {
  const app = express();
  const email = randomUUID() + '@example.com';
  const password = randomUUID();
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // Refresh tokens are disabled for super admins, so use a regular project user
    const { project, client: testClient, repo } = await createTestProject({ withClient: true, withRepo: true });
    client = testClient;

    const { user } = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      email,
    });
    await setPassword(repo.getSystemRepo(), user, password);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function getAccessToken(): Promise<string> {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.access_token).toBeDefined();
    return res2.body.access_token;
  }

  test('Token introspection', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.access_token).toBeDefined();
    const token = res2.body.access_token;

    const res3 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + token)
      .send({ token });
    expect(res3).toHaveStatus(200);
    const result = res3.body;
    expect(result.active).toEqual(true);
    expect(result.iss).toBeDefined();
    expect(result.sub).toBeDefined();
  });

  test('Token introspection rejects ID tokens', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();

    // Introspection is defined for access and refresh tokens only, and an ID token is audienced
    // to the client rather than to the issuer
    const res3 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + res2.body.access_token)
      .send({ token: res2.body.id_token });
    expect(res3).toHaveStatus(200);
    expect(res3.body).toStrictEqual({ active: false });
  });

  test('Introspection requires authentication', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);

    // RFC 7662 section 2.1 requires the introspection endpoint to authenticate the caller
    const res3 = await request(app).post(`/oauth2/introspect`).send({ token: res2.body.access_token });
    expect(res3).toHaveStatus(401);
  });

  test('Token introspection on rotated refresh token', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid offline_access',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.refresh_token).toBeDefined();

    // Use the refresh token, which rotates the login's refresh secret and expires this token
    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3).toHaveStatus(200);
    expect(res3.body.refresh_token).toBeDefined();

    const accessToken = res3.body.access_token;

    // The rotated-out refresh token is no longer valid, even though its JWT expiry is in the future
    const res4 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ token: res2.body.refresh_token });
    expect(res4).toHaveStatus(200);
    expect(res4.body).toStrictEqual({ active: false });

    // The current refresh token is still introspectable
    const res5 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ token: res3.body.refresh_token });
    expect(res5).toHaveStatus(200);
    expect(res5.body.active).toEqual(true);
  });

  test('Token introspection on revoked token', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.access_token).toBeDefined();
    const token = res2.body.access_token;

    const resLogout = await request(app)
      .post('/oauth2/logout')
      .set('Authorization', 'Bearer ' + token)
      .send();
    expect(resLogout).toHaveStatus(200);

    // Revoking the login also invalidates the token, so introspect as a separate caller
    const callerToken = await getAccessToken();

    const res3 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + callerToken)
      .send({ token });
    expect(res3).toHaveStatus(200);
    expect(res3.body).toStrictEqual({ active: false });
  });

  test('Token introspection rejects cross-Project token', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.access_token).toBeDefined();
    const token = res2.body.access_token;

    // The token is active when introspected by the client it was issued to
    const res3 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + token)
      .send({ token });
    expect(res3).toHaveStatus(200);
    expect(res3.body.active).toEqual(true);

    // A caller in an unrelated Project learns nothing about the token
    const { accessToken: otherProjectToken } = await createTestProject({ withAccessToken: true });
    const res4 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + otherProjectToken)
      .send({ token });
    expect(res4).toHaveStatus(200);
    expect(res4.body).toStrictEqual({ active: false });

    // Same ClientApplication, but authenticated into another Project
    const { project: otherProject } = await createTestProject();
    const systemRepo = getGlobalSystemRepo();
    const otherMembership = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: createReference(otherProject),
      user: createReference(client),
      profile: createReference(client),
    });
    const otherLogin = await systemRepo.createResource<Login>({
      resourceType: 'Login',
      authMethod: 'client',
      user: createReference(client),
      client: createReference(client),
      membership: createReference(otherMembership),
      authTime: new Date().toISOString(),
      granted: true,
      scope: 'openid',
    });
    const sharedClientToken = await generateAccessToken({
      login_id: otherLogin.id,
      sub: client.id,
      username: client.id,
      client_id: client.id,
      profile: getReferenceString(client),
      scope: 'openid',
    });
    const res5 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + sharedClientToken)
      .send({ token });
    expect(res5).toHaveStatus(200);
    expect(res5.body).toStrictEqual({ active: false });
  });

  test('Token parameter required', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res).toHaveStatus(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2).toHaveStatus(200);
    expect(res2.body.access_token).toBeDefined();
    const token = res2.body.access_token;

    const res3 = await request(app)
      .post(`/oauth2/introspect`)
      .set('Authorization', 'Bearer ' + token)
      .send({});
    expect(res3).toHaveStatus(400);
  });
});
