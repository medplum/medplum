// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JWTPayload, ProfileResource, WithId } from '@medplum/core';
import { ContentType, getReferenceString, OAuthClientAssertionType, OAuthGrantType, OAuthTokenType } from '@medplum/core';
import type { ClientApplication, Patient, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import type * as Jose from 'jose';
import { decodeJwt, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { vi } from 'vitest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { getProjectSystemRepo } from '../fhir/repo';
import { addTestUser, createTestProject, generateSelfSignedCert } from '../test.setup';
import { mockFetchJson } from '../test.setup.fetch';

// The Google login and private_key_jwt client-assertion strategies verify a signed JWT
// against a remote JWKS (Google's public certs, or a client's configured jwksUri). Mocking
// the network fetch is not viable here — jose's Node build fetches JWKS via raw node:http(s),
// bypassing any `globalThis.fetch` mock — so, matching the existing convention in
// google.test.ts and oauth/token.test.ts, `jwtVerify` itself is replaced to decode the JWT's
// claims without performing real signature verification.
vi.mock('jose', async (importOriginal) => {
  const core: { parseJWTPayload: (token: string) => JWTPayload } = await vi.importActual('@medplum/core');
  const original = await importOriginal<typeof Jose>();
  return {
    ...original,
    // token.ts destructures `customFetch` from 'jose' unconditionally; the installed jose
    // version here predates that export, so provide a stand-in symbol to satisfy the access —
    // its actual behavior is irrelevant since `jwtVerify` below never consults it for real.
    customFetch: (original as { customFetch?: symbol }).customFetch ?? Symbol('customFetch'),
    jwtVerify: vi.fn(async (credential: string) => ({ payload: core.parseJWTPayload(credential) })),
  };
});

/**
 * Regression suite for #9879: end-to-end coverage of every supported authentication
 * strategy — the four named in the issue (native password, external/OIDC, JWT bearer
 * token exchange, client credentials/M2M) plus additional strategies discovered while
 * auditing `Login.authMethod` and the `/oauth2/token` grant-type switch: Google-specific
 * login, the OpenID4VCI pre-authorized code grant, direct HTTP Basic auth against the
 * FHIR API, and the mTLS / private_key_jwt variants of client credentials. Each strategy
 * gets its own isolated Project/ClientApplication/user fixtures and its own `describe`
 * block, so a regression introduced in one strategy's code cannot spuriously fail another
 * strategy's tests, and CI output attributes a failure to the exact strategy by
 * describe/test name.
 *
 * Every test drives the strategy's real HTTP front door (via supertest against a real
 * `initApp()` instance), obtains a Medplum access token, and then uses that token to
 * make a real `/fhir/R4` call — proving the token is actually usable, not just that a
 * token-shaped object was returned. Fine-grained edge cases (bad credentials, malformed
 * input, IP rules, etc.) remain covered by the existing per-strategy unit test files
 * (login.test.ts, google.test.ts, external.test.ts, oauth/token.test.ts); this suite is
 * the coarse-grained "did the whole flow work" net.
 */

function buildPatient(): Patient {
  return { resourceType: 'Patient', name: [{ family: 'AuthStrategyRegression-' + randomUUID() }] };
}

describe('Native password login', () => {
  const app = express();
  const email = randomUUID() + '@example.com';
  const password = randomUUID();
  let config: MedplumServerConfig;
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ project, client } = await createTestProject({ withClient: true }));
    await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Native',
      lastName: 'User',
      email,
      password,
      sendEmail: false,
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Password grant issues a token usable against the FHIR API', async () => {
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
    expect(tokenRes.body.scope).toBe('openid');
    expect(tokenRes.body.profile.reference).toMatch(/^Practitioner\//);
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});

describe('External/OIDC login', () => {
  const app = express();
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  const domain = randomUUID() + '.example.com';
  const redirectUri = `https://${domain}/auth/callback`;
  const email = randomUUID() + '@example.com';
  const identityProvider = {
    authorizeUrl: 'https://example.com/oauth2/authorize',
    tokenUrl: 'https://example.com/oauth2/token',
    userInfoUrl: 'https://example.com/oauth2/userinfo',
    clientId: '123',
    clientSecret: '456',
  };
  let config: MedplumServerConfig;
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ project } = await createTestProject());
    const systemRepo = await getProjectSystemRepo(project);
    client = await createClient(systemRepo, {
      project,
      name: 'External Auth Client',
      redirectUri,
      identityProvider: {
        ...identityProvider,
        identitySource: 'email',
        identityMappingMode: 'user-email',
      },
    });
    await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'External',
      lastName: 'User',
      email,
      sendEmail: false,
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('External IdP callback issues a token usable against the FHIR API', async () => {
    const state = JSON.stringify({
      redirectUri,
      clientId: client.id,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    const callbackUrl = `/auth/external?code=${randomUUID()}&state=${encodeURIComponent(state)}`;

    // Mock the external identity provider's token endpoint response
    const idToken = 'header.' + Buffer.from(JSON.stringify({ email }), 'ascii').toString('base64') + '.signature';
    fetchMock.mockImplementation(() => mockFetchJson({ id_token: idToken }));

    const callbackRes = await request(app).get(callbackUrl);
    expect(callbackRes.status).toBe(302);

    const redirect = new URL(callbackRes.header.location);
    expect(redirect.host).toBe(domain);
    const code = redirect.searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.AuthorizationCode,
      code,
      code_verifier: 'xyz',
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    expect(tokenRes.body.profile.reference).toMatch(/^Practitioner\//);
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});

describe('JWT bearer token exchange (RFC 8693)', () => {
  // This is the strategy referred to as "direct JWT bearer" in #9879: exchanging a
  // third-party token (JWT or opaque) for a Medplum access token via
  // grant_type=urn:ietf:params:oauth:grant-type:token-exchange (RFC 8693). The distinct
  // RFC 7523 `grant_type=jwt-bearer` grant referenced by MedplumClient.startJwtBearerLogin
  // has no server-side handler and is intentionally out of scope here (tracked separately).
  const app = express();
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  const redirectUri = `https://${randomUUID()}.example.com/auth/callback`;
  const email = randomUUID() + '@example.com';
  let config: MedplumServerConfig;
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ project } = await createTestProject());
    const systemRepo = await getProjectSystemRepo(project);
    client = await createClient(systemRepo, {
      project,
      name: 'Token Exchange Client',
      redirectUri,
      identityProvider: {
        authorizeUrl: 'https://example.com/oauth2/authorize',
        tokenUrl: 'https://example.com/oauth2/token',
        userInfoUrl: 'https://example.com/oauth2/userinfo',
        clientId: '123',
        clientSecret: '456',
      },
    });
    await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Exchange',
      lastName: 'User',
      email,
      sendEmail: false,
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Token exchange grant issues a token usable against the FHIR API', async () => {
    fetchMock.mockImplementation(() => mockFetchJson({ email }));

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: client.id,
      subject_token: 'third-party-subject-token',
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    expect(tokenRes.body.profile.reference).toMatch(/^Practitioner\//);
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});

describe('Client credentials (machine-to-machine)', () => {
  const app = express();
  let config: MedplumServerConfig;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ client } = await createTestProject({ withClient: true }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Client credentials grant issues a token usable against the FHIR API', async () => {
    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.ClientCredentials,
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    expect(tokenRes.body.profile.reference).toBe(`ClientApplication/${client.id}`);
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});

describe('Google login', () => {
  // Distinct route/handler (`/auth/google`) from the generic external OIDC callback above,
  // even though both are conceptually "external/OIDC" — Google verifies a Google-issued ID
  // token directly rather than doing a redirect/code exchange with an arbitrary IdP.
  const app = express();
  const email = randomUUID() + '@example.com';
  let config: MedplumServerConfig;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    const created = await createTestProject({ withClient: true });
    client = created.client;
    await inviteUser({
      project: created.project,
      resourceType: 'Practitioner',
      firstName: 'Google',
      lastName: 'User',
      email,
      sendEmail: false,
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Google ID token issues a token usable against the FHIR API', async () => {
    const keyPair = await generateKeyPair('RS256');
    const googleCredential = await new SignJWT({ email, given_name: 'Google', family_name: 'User' })
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
    expect(tokenRes.body.profile.reference).toMatch(/^Practitioner\//);
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});

describe('Pre-authorized code grant (OpenID4VCI)', () => {
  // See: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-urnietfparamsoauthgrant-typ
  // An admin mints a one-time code "on behalf of" a target user (e.g. for a verifiable
  // credential wallet), and the wallet exchanges that code for a token — with no
  // interactive login step at all.
  const app = express();
  let config: MedplumServerConfig;
  let client: WithId<ClientApplication>;
  let adminAccessToken: string;
  let targetProfile: WithId<ProfileResource>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    const created = await createTestProject({
      withClient: true,
      withAccessToken: true,
      membership: { admin: true },
    });
    client = created.client;
    adminAccessToken = created.accessToken;
    const target = await addTestUser(created.project);
    targetProfile = target.profile;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Pre-authorized code issues a token usable against the FHIR API', async () => {
    const preAuthRes = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(targetProfile))
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
    expect(tokenRes.body.profile.reference).toBe(getReferenceString(targetProfile));
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});

describe('Direct HTTP Basic auth against the FHIR API', () => {
  // A distinct code path from client_credentials: the client presents its ID/secret as an
  // HTTP Basic header on every FHIR request instead of exchanging them for a bearer token
  // at /oauth2/token at all. See getLoginForBasicAuth in oauth/utils.ts.
  const app = express();
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ client } = await createTestProject({ withClient: true }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Basic auth credentials are usable directly against the FHIR API', async () => {
    const basicAuth = 'Basic ' + Buffer.from(`${client.id}:${client.secret}`).toString('base64');

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', basicAuth)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);

    // A second request with the wrong secret must be rejected, proving the credentials are
    // actually checked and not just any Basic header is accepted.
    const wrongAuth = 'Basic ' + Buffer.from(`${client.id}:wrong-secret`).toString('base64');
    const rejectedRes = await request(app).get('/fhir/R4/Patient').set('Authorization', wrongAuth);
    expect(rejectedRes.status).toBe(401);
  });
});

describe('Client credentials via mTLS (machine-to-machine)', () => {
  // A distinct client-authentication mechanism from the shared-secret variant above: the
  // client presents a certificate (matched against the ClientApplication's configured trust
  // store) instead of a client_secret.
  const app = express();
  let config: MedplumServerConfig;
  let client: WithId<ClientApplication>;
  let cert: string;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    ({ cert } = generateSelfSignedCert('CN=Auth Strategy Regression Test Client'));
    ({ client } = await createTestProject({ withClient: true, client: { certificateTrustStore: cert } }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('mTLS client certificate issues a token usable against the FHIR API', async () => {
    const tokenRes = await request(app)
      .post('/oauth2/token')
      .type('form')
      .set('x-mtls-cert', encodeURIComponent(cert))
      .send({
        grant_type: OAuthGrantType.ClientCredentials,
        client_id: client.id,
      });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    expect(tokenRes.body.profile.reference).toBe(`ClientApplication/${client.id}`);
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});

describe('Client credentials via private_key_jwt (machine-to-machine)', () => {
  // Another distinct client-authentication mechanism (RFC 7523 client assertion): the
  // client signs a JWT with its own private key instead of sending a client_secret; the
  // server verifies it against the client's configured JWKS URL.
  const app = express();
  let config: MedplumServerConfig;
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
    const { project } = await createTestProject();
    const systemRepo = await getProjectSystemRepo(project);
    client = await createClient(systemRepo, {
      project,
      name: 'Client Assertion Test Client',
      jwksUri: 'https://example.com/jwks.json',
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('private_key_jwt client assertion issues a token usable against the FHIR API', async () => {
    const keyPair = await generateKeyPair('ES384');
    const clientAssertion = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES384' })
      .setIssuedAt()
      .setIssuer(client.id)
      .setSubject(client.id)
      .setAudience(config.tokenUrl)
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);

    const tokenRes = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.ClientCredentials,
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: clientAssertion,
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toBeDefined();
    expect(tokenRes.body.profile.reference).toBe(`ClientApplication/${client.id}`);
    expect(decodeJwt(tokenRes.body.access_token).aud).toBe(config.issuer);

    const patient = buildPatient();
    const fhirRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + tokenRes.body.access_token)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(patient);
    expect(fhirRes.status).toBe(201);
    expect(fhirRes.body.name).toMatchObject(patient.name as object);
  });
});
