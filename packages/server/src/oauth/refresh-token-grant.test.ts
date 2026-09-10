// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, sleep } from '@medplum/core';
import type { AccessPolicy, ClientApplication, Login, Project } from '@medplum/fhirtypes';
import express from 'express';
import { decodeJwt } from 'jose';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { setPassword } from '../auth/setpassword';
import { loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { rotateLoginRefreshSecret } from './token';

// This file deliberately does NOT mock `jose`.
//
// `token.test.ts` replaces `jwtVerify` for its entire module graph with a decode-only stub that
// ignores the key resolver and the `issuer` option. That stub is load-bearing for the external-JWKS
// cases in that file, but it means none of its refresh-token tests exercise signature validity,
// issuer binding, expiry, or `nbf`. A forged-token test added there would pass whether or not the
// server actually rejected the forgery, and the rotation test's final step passes because the
// refresh secret mismatched rather than because of anything cryptographic.
//
// Everything here runs against real verification in `oauth/keys.ts` `verifyJwt`, so the signature
// and token-type assertions below are meaningful. The "Known gaps" block asserts current behavior
// so that the follow-up fixes show up as assertions changing rather than as new tests appearing.

describe('Refresh token grant', () => {
  const app = express();
  const domain = randomUUID() + '.example.com';
  const email = `refresh-grant@${domain}`;
  const password = randomUUID();
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({ project, client } = await createTestProject({
      withClient: true,
      withAccessToken: true,
      membership: { admin: true },
    }));
    systemRepo = await getProjectSystemRepo(project);

    const accessPolicy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: '*' }],
      ipAccessRule: [
        { name: 'Block test', value: '6.6.6.6', action: 'block' },
        { name: 'Allow by default', value: '*', action: 'allow' },
      ],
    });

    const { user, membership } = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Refresh',
      lastName: 'User',
      email,
    });
    await systemRepo.updateResource({ ...membership, accessPolicy: createReference(accessPolicy) });
    await setPassword(systemRepo, user, password);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  /**
   * Runs the full authorization code flow and returns the token endpoint response body.
   * @param options - Optional overrides.
   * @param options.ip - Value to send as `X-Forwarded-For` on the login request.
   * @param options.tokenPath - Token endpoint path, for exercising project-scoped mounts.
   * @returns The token endpoint response body, including a refresh token.
   */
  async function getTokens(options?: { ip?: string; tokenPath?: string }): Promise<Record<string, string>> {
    const loginRequest = request(app).post('/auth/login').type('json');
    if (options?.ip) {
      loginRequest.set('X-Forwarded-For', options.ip);
    }
    const loginResponse = await loginRequest.send({
      email,
      password,
      clientId: client.id,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      scope: 'openid offline_access',
    });
    expect(loginResponse).toHaveStatus(200);

    const tokenResponse = await request(app)
      .post(options?.tokenPath ?? '/oauth2/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: loginResponse.body.code, code_verifier: 'xyz' });
    expect(tokenResponse).toHaveStatus(200);
    expect(tokenResponse.body.refresh_token).toBeDefined();
    return tokenResponse.body;
  }

  function refresh(refreshToken: string): request.Test {
    return request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  function readLoginFor(refreshToken: string): Promise<Login> {
    const claims = decodeJwt(refreshToken) as { login_id: string };
    return systemRepo.readResource<Login>('Login', claims.login_id);
  }

  test('Rejects a refresh token signed with "alg": "none"', async () => {
    const tokens = await getTokens();
    const [, payload] = tokens.refresh_token.split('.');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');

    const res = await refresh(`${header}.${payload}.`);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({ error: 'invalid_request', error_description: 'Invalid refresh token' });
  });

  test('Rejects a refresh token re-signed with HS256', async () => {
    const tokens = await getTokens();
    const [originalHeader, payload] = tokens.refresh_token.split('.');
    const { kid } = JSON.parse(Buffer.from(originalHeader, 'base64url').toString());
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid })).toString('base64url');
    const signature = createHmac('sha256', 'secret').update(`${header}.${payload}`).digest('base64url');

    const res = await refresh(`${header}.${payload}.${signature}`);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({ error: 'invalid_request', error_description: 'Invalid refresh token' });
  });

  test('Rejects a refresh token with a tampered payload', async () => {
    const tokens = await getTokens();
    const [header, payload, signature] = tokens.refresh_token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const tampered = Buffer.from(JSON.stringify({ ...claims, login_id: randomUUID() })).toString('base64url');

    const res = await refresh(`${header}.${tampered}.${signature}`);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({ error: 'invalid_request', error_description: 'Invalid refresh token' });
  });

  test('Rejects an access token presented as a refresh token', async () => {
    const tokens = await getTokens();
    const res = await refresh(tokens.access_token);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({ error: 'invalid_request', error_description: 'Invalid refresh token' });
  });

  test('Rejects an ID token presented as a refresh token', async () => {
    const tokens = await getTokens();
    const res = await refresh(tokens.id_token);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({ error: 'invalid_request', error_description: 'Invalid refresh token' });
  });

  test('Rejects a refresh token presented as a bearer access token', async () => {
    const tokens = await getTokens();
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', `Bearer ${tokens.refresh_token}`);
    expect(res).toHaveStatus(401);
  });

  test('Rejects a refresh token redeemed under a different project scope', async () => {
    const { project: otherProject } = await createTestProject({});
    const tokens = await getTokens();
    expect((decodeJwt(tokens.refresh_token) as { iss?: string }).iss).not.toContain('projects/');

    const res = await request(app)
      .post(`/projects/${otherProject.id}/oauth2/token`)
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject({ error: 'invalid_request', error_description: 'Invalid refresh token' });
  });

  test('Replaying a rotated refresh token revokes the login', async () => {
    const tokens = await getTokens();
    const rotated = await refresh(tokens.refresh_token);
    expect(rotated).toHaveStatus(200);
    expect(rotated.body.refresh_token).toBeDefined();
    expect(rotated.body.refresh_token).not.toStrictEqual(tokens.refresh_token);

    const replay = await refresh(tokens.refresh_token);
    expect(replay).toHaveStatus(400);
    expect(replay.body).toMatchObject({ error: 'invalid_grant', error_description: 'Token revoked' });

    const login = await readLoginFor(tokens.refresh_token);
    expect(login.revoked).toStrictEqual(true);

    const afterReplay = await refresh(rotated.body.refresh_token);
    expect(afterReplay).toHaveStatus(400);
    expect(afterReplay.body).toMatchObject({ error: 'invalid_grant', error_description: 'Token revoked' });
  });

  test('Revoking on reuse also invalidates already-issued access tokens', async () => {
    const tokens = await getTokens();
    const rotated = await refresh(tokens.refresh_token);
    expect(rotated).toHaveStatus(200);

    const beforeReuse = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', `Bearer ${rotated.body.access_token}`);
    expect(beforeReuse).toHaveStatus(200);

    await refresh(tokens.refresh_token);

    const afterReuse = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', `Bearer ${rotated.body.access_token}`);
    expect(afterReuse).toHaveStatus(401);
  });

  test('Rotation loses a write conflict and reports reuse rather than rotating again', async () => {
    // The concurrent-refresh test below only races if the requests happen to overlap. This one
    // forces the conflict, so the serialization failure and `withTransaction`'s retry of the
    // callback are actually exercised.
    const tokens = await getTokens();
    const loginId = (decodeJwt(tokens.refresh_token) as { login_id: string }).login_id;
    const original = await systemRepo.readResource<Login>('Login', loginId);
    const originalSecret = original.refreshSecret as string;

    const firstWriteDone = Promise.withResolvers<undefined>();
    const allowFirstCommit = Promise.withResolvers<undefined>();

    const holder = getGlobalSystemRepo().withTransaction(
      async (txRepo) => {
        await txRepo.patchResource<Login>('Login', loginId, [
          { op: 'add', path: '/refreshSecret', value: 'secret-from-the-winning-caller' },
        ]);
        firstWriteDone.resolve(undefined);
        await allowFirstCommit.promise;
      },
      { resourceTypes: ['Login'], source: 'test.refreshRotationConflict' }
    );

    await firstWriteDone.promise;
    const loser = withTestContext(() => rotateLoginRefreshSecret(original, originalSecret));
    await sleep(100);
    allowFirstCommit.resolve(undefined);

    await holder;
    expect(await loser).toBeUndefined();

    const after = await systemRepo.readResource<Login>('Login', loginId);
    expect(after.refreshSecret).toStrictEqual('secret-from-the-winning-caller');
  });

  test('Only one of several concurrent refreshes with the same token succeeds', async () => {
    const tokens = await getTokens();
    const responses = await Promise.all([1, 2, 3, 4, 5].map(() => refresh(tokens.refresh_token)));

    const succeeded = responses.filter((res) => res.status === 200);
    expect(succeeded.length).toStrictEqual(1);

    // Assert the exact body so a request that errored cannot pass as one that lost the race.
    for (const loser of responses.filter((res) => res.status !== 200)) {
      expect(loser).toHaveStatus(400);
      expect(loser.body).toMatchObject({ error: 'invalid_grant', error_description: 'Token revoked' });
    }

    const login = await readLoginFor(tokens.refresh_token);
    expect(login.revoked).toStrictEqual(true);
  });

  /*
   * Every test in this block asserts CURRENT behavior, not desired behavior.
   *
   * These are the remaining gaps identified while triaging an external disclosure of the refresh
   * grant. They are captured here so that the fixes land as visible changes to these assertions,
   * and so that nothing silently regresses in the meantime. Each test names the fix that will
   * change it.
   */
  describe('Known gaps', () => {
    test('Confidential client can refresh without client authentication', async () => {
      // Fix: require client authentication when the login's client has a secret (RFC 6749 section 6).
      expect(client.secret).toBeDefined();
      const tokens = await getTokens();

      // `handleRefreshToken` gates client authentication on the presence of an Authorization
      // header, and ignores `client_secret` in the request body, so the caller chooses whether
      // the check runs at all.
      const res = await refresh(tokens.refresh_token);
      expect(res).toHaveStatus(200);
    });

    test('IP access rules are not enforced on refresh', async () => {
      // Fix: call `checkIpAccessRules` here, as client_credentials and pre-authorized code already do.
      const tokens = await getTokens({ ip: '5.5.5.5' });

      const res = await request(app)
        .post('/oauth2/token')
        .set('X-Forwarded-For', '6.6.6.6')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
      expect(res).toHaveStatus(200);

      // Worse, the blocked address is written to the login, so the audit trail records the caller
      // that the rule should have stopped.
      const login = await readLoginFor(tokens.refresh_token);
      expect(login.remoteAddress).toStrictEqual('6.6.6.6');
    });
  });
});
