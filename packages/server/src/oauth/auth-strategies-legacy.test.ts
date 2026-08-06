// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JWTPayload, WithId } from '@medplum/core';
import { ContentType, getReferenceString, OAuthGrantType, OAuthTokenType } from '@medplum/core';
import type { ClientApplication, Patient, Project, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import express from 'express';
import type * as Jose from 'jose';
import { generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { vi } from 'vitest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { mockFetchJson } from '../test.setup.fetch';

// Same jose mock as auth-strategies.test.ts (see the comment there for the full story):
// remote-JWKS verification (used only by the Google login path in this file) is stubbed to
// decode-only because jose fetches JWKS via raw node:http(s), bypassing any fetch mock.
// Medplum's own access-token verification uses a plain local key-resolver function and
// still runs the real jwtVerify.
vi.mock('jose', async (importOriginal) => {
  const core: { parseJWTPayload: (token: string) => JWTPayload } = await vi.importActual('@medplum/core');
  const original = await importOriginal<typeof Jose>();
  return {
    ...original,
    customFetch: (original as { customFetch?: symbol }).customFetch ?? Symbol('customFetch'),
    jwtVerify: vi.fn(
      async (
        jwt: string,
        keyOrKeySet: Parameters<typeof original.jwtVerify>[1],
        options?: Parameters<typeof original.jwtVerify>[2]
      ) => {
        const isRemoteJwks = typeof keyOrKeySet === 'function' && 'coolingDown' in keyOrKeySet;
        if (!isRemoteJwks) {
          return original.jwtVerify(jwt, keyOrKeySet, options);
        }
        return { payload: core.parseJWTPayload(jwt) };
      }
    ),
  };
});

/**
 * Compatibility suite for #9880: every user-identity authentication strategy must keep
 * working for legacy accounts whose email address was never verified.
 *
 * Accounts created before Medplum required verified emails during onboarding have no
 * `User.emailVerified` value at all, and accounts whose email was later changed by an
 * admin (see fhir/operations/update-user-email.ts) carry an explicit `emailVerified:
 * false`. The July 2026 /auth/external incident showed how easily a verified-email
 * policy meant for one flow can leak into another and lock these accounts out, so each
 * strategy below runs against both legacy shapes and proves the resulting token works —
 * and that logging in does not silently flip the account's verification state.
 *
 * The machine-to-machine strategies (client credentials via shared secret, mTLS, and
 * private_key_jwt, plus direct HTTP Basic auth) authenticate a ClientApplication, which
 * has no email to verify, so they have no legacy-account shape to cover; they remain
 * covered by auth-strategies.test.ts.
 */

const LEGACY_SHAPES: { shape: string; emailVerified: false | undefined }[] = [
  { shape: 'emailVerified missing (account predates the field)', emailVerified: undefined },
  { shape: 'emailVerified explicitly false', emailVerified: false },
];

async function createLegacyUser(
  project: WithId<Project>,
  emailVerified: false | undefined,
  password?: string
): Promise<{ user: WithId<User>; email: string; profileReference: string }> {
  const email = randomUUID() + '@example.com';
  const { user, profile } = await inviteUser({
    project,
    resourceType: 'Practitioner',
    firstName: 'Legacy',
    lastName: 'User',
    email,
    password,
    sendEmail: false,
  });

  // Force the exact legacy shape rather than relying on inviteUser happening to leave
  // `emailVerified` unset, then read back to prove the fixture is what it claims to be.
  const systemRepo = getGlobalSystemRepo();
  await systemRepo.updateResource<User>({ ...user, emailVerified });
  const fixture = await systemRepo.readResource<User>('User', user.id);
  expect(fixture.emailVerified).toStrictEqual(emailVerified);

  return { user: fixture, email, profileReference: getReferenceString(profile) };
}

// Proves the access token is actually usable (a real FHIR write succeeds), and that the
// login flow did not mutate the legacy account's verification state as a side effect.
async function expectTokenUsableAndUserUnchanged(app: Express, accessToken: string, user: WithId<User>): Promise<void> {
  const patient: Patient = { resourceType: 'Patient', name: [{ family: 'LegacyAuthCompat-' + randomUUID() }] };
  const fhirRes = await request(app)
    .post('/fhir/R4/Patient')
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .send(patient);
  expect(fhirRes.status).toBe(201);
  expect(fhirRes.body.name).toMatchObject(patient.name as object);

  const after = await getGlobalSystemRepo().readResource<User>('User', user.id);
  expect(after.emailVerified).toStrictEqual(user.emailVerified);
}

describe('Native password login with legacy unverified email', () => {
  const app = express();
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ project, client } = await createTestProject({ withClient: true }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(LEGACY_SHAPES)('$shape', async ({ emailVerified }) => {
    const password = randomUUID();
    const { user, email } = await createLegacyUser(project, emailVerified, password);

    const loginRes = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
      scope: 'openid',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.code).toBeDefined();

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.AuthorizationCode,
      code: loginRes.body.code,
      code_verifier: 'xyz',
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();

    await expectTokenUsableAndUserUnchanged(app, tokenRes.body.access_token, user);
  });
});

describe('External/OIDC login with legacy unverified email', () => {
  // The exact flow the July 2026 incident broke: /auth/external mapping the external
  // identity to a Medplum user by email address.
  const app = express();
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  const domain = randomUUID() + '.example.com';
  const redirectUri = `https://${domain}/auth/callback`;
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ project } = await createTestProject());
    const systemRepo = await getProjectSystemRepo(project);
    client = await createClient(systemRepo, {
      project,
      name: 'Legacy External Auth Client',
      redirectUri,
      identityProvider: {
        authorizeUrl: 'https://example.com/oauth2/authorize',
        tokenUrl: 'https://example.com/oauth2/token',
        userInfoUrl: 'https://example.com/oauth2/userinfo',
        clientId: '123',
        clientSecret: '456',
        identitySource: 'email',
        identityMappingMode: 'user-email',
      },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(LEGACY_SHAPES)('$shape', async ({ emailVerified }) => {
    const { user, email } = await createLegacyUser(project, emailVerified);

    const state = JSON.stringify({
      redirectUri,
      clientId: client.id,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    const idToken = 'header.' + Buffer.from(JSON.stringify({ email }), 'ascii').toString('base64url') + '.signature';
    fetchMock.mockImplementation(() => mockFetchJson({ id_token: idToken }));

    const callbackRes = await request(app).get(
      `/auth/external?code=${randomUUID()}&state=${encodeURIComponent(state)}`
    );
    // The incident's failure mode was an HTTP 400 ("External token email is not verified")
    // here. Asserting on status AND body means a regression shows the actual
    // OperationOutcome in the test failure output.
    expect({ status: callbackRes.status, body: callbackRes.body }).toMatchObject({ status: 302, body: {} });

    const code = new URL(callbackRes.header.location).searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.AuthorizationCode,
      code,
      code_verifier: 'xyz',
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();

    await expectTokenUsableAndUserUnchanged(app, tokenRes.body.access_token, user);
  });
});

describe('JWT bearer token exchange (RFC 8693) with legacy unverified email', () => {
  const app = express();
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ project } = await createTestProject());
    const systemRepo = await getProjectSystemRepo(project);
    client = await createClient(systemRepo, {
      project,
      name: 'Legacy Token Exchange Client',
      redirectUri: `https://${randomUUID()}.example.com/auth/callback`,
      identityProvider: {
        authorizeUrl: 'https://example.com/oauth2/authorize',
        tokenUrl: 'https://example.com/oauth2/token',
        userInfoUrl: 'https://example.com/oauth2/userinfo',
        clientId: '123',
        clientSecret: '456',
      },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(LEGACY_SHAPES)('$shape', async ({ emailVerified }) => {
    const { user, email } = await createLegacyUser(project, emailVerified);

    fetchMock.mockImplementation(() => mockFetchJson({ email }));

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: client.id,
      subject_token: 'third-party-subject-token',
    });
    expect({ status: tokenRes.status, body: tokenRes.body }).toMatchObject({ status: 200 });
    expect(tokenRes.body.access_token).toBeDefined();

    await expectTokenUsableAndUserUnchanged(app, tokenRes.body.access_token, user);
  });
});

describe('Google login with legacy unverified email', () => {
  const app = express();
  let config: MedplumServerConfig;
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ project, client } = await createTestProject({ withClient: true }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(LEGACY_SHAPES)('$shape', async ({ emailVerified }) => {
    const { user, email } = await createLegacyUser(project, emailVerified);

    const keyPair = await generateKeyPair('RS256');
    const googleCredential = await new SignJWT({ email, given_name: 'Legacy', family_name: 'User' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setIssuer('https://accounts.google.com')
      .setSubject(randomUUID())
      .setAudience(config.googleClientId as string)
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);

    const googleRes = await request(app).post('/auth/google').type('json').send({
      googleClientId: config.googleClientId,
      googleCredential,
      clientId: client.id,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(googleRes.status).toBe(200);
    expect(googleRes.body.code).toBeDefined();

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.AuthorizationCode,
      code: googleRes.body.code,
      code_verifier: 'xyz',
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();

    await expectTokenUsableAndUserUnchanged(app, tokenRes.body.access_token, user);
  });
});

describe('Pre-authorized code grant (OpenID4VCI) with legacy unverified email', () => {
  const app = express();
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;
  let adminAccessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const created = await createTestProject({
      withClient: true,
      withAccessToken: true,
      membership: { admin: true },
    });
    project = created.project;
    client = created.client;
    adminAccessToken = created.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(LEGACY_SHAPES)('$shape', async ({ emailVerified }) => {
    const { user, profileReference } = await createLegacyUser(project, emailVerified);

    const preAuthRes = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('X-Medplum-On-Behalf-Of', profileReference)
      .type('json')
      .send({ clientId: client.id });
    expect(preAuthRes.status).toBe(200);
    expect(preAuthRes.body.preAuthorizedCode).toBeDefined();

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.PreAuthorizedCode,
      client_id: client.id,
      'pre-authorized_code': preAuthRes.body.preAuthorizedCode,
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    expect(tokenRes.body.profile.reference).toBe(profileReference);

    await expectTokenUsableAndUserUnchanged(app, tokenRes.body.access_token, user);
  });
});

// Single file-level restore for the layered `vi.spyOn(globalThis, 'fetch')` spies — see the
// matching comment at the bottom of auth-strategies.test.ts for why per-describe restores
// are unsafe here.
afterAll(() => {
  vi.restoreAllMocks();
});
