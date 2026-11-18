// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, Logger, OAuthTokenAuthMethod } from '@medplum/core';
import type {
  ClientApplication,
  DomainConfiguration,
  Login,
  Project,
  ProjectMembership,
  User,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { vi } from 'vitest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { getUserByEmailWithoutProject, hashCode } from '../oauth/utils';
import { getCacheRedis } from '../redis';
import { withTestContext } from '../test.setup';
import { mockFetchJson, mockFetchText } from '../test.setup.fetch';
import { EXTERNAL_AUTH_STATE_TTL_SECONDS } from './external';
import { registerNew } from './register';

const fetchMock = vi.spyOn(globalThis, 'fetch');
const app = express();
const domain = randomUUID() + '.example.com';
const email = `text@${domain}`;
const domain2 = randomUUID() + '.example.com';
const redirectUri = `https://${domain}/auth/callback`;
const externalId = `google-oauth2|${randomUUID()}`;
const identityProvider = {
  authorizeUrl: 'https://example.com/oauth2/authorize',
  tokenUrl: 'https://example.com/oauth2/token',
  userInfoUrl: 'https://example.com/oauth2/userinfo',
  clientId: '123',
  clientSecret: '456',
};

let project: WithId<Project>;
let systemRepo: SystemRepository;
let defaultClient: ClientApplication;
let externalAuthClient: ClientApplication;
// A client in a Project without the legacyExternalAuth system setting
let otherProject: WithId<Project>;
let otherClient: ClientApplication;
const otherEmail = `other-${randomUUID()}@example.com`;

describe('External', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(async () => {
      await initApp(app, config);

      // Create a new project
      const registerResult = await registerNew({
        firstName: 'External',
        lastName: 'Text',
        projectName: 'External Test Project',
        email,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      });
      defaultClient = registerResult.client;

      systemRepo = await getProjectSystemRepo(registerResult.project);
      project = await systemRepo.updateResource<Project>({
        ...registerResult.project,
        systemSetting: [{ name: 'legacyExternalAuth', valueBoolean: true }],
      });

      // Create a domain configuration with external identity provider
      await systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider,
      });

      // Create a domain configuration without an external identity provider
      await systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain: domain2,
      });

      // Create a new client application with external auth
      externalAuthClient = await createClient(systemRepo, {
        project,
        name: 'External Auth Client',
        redirectUri,
      });

      // Update client application with external auth
      await systemRepo.updateResource<ClientApplication>({
        ...externalAuthClient,
        identityProvider: {
          ...identityProvider,
          identitySource: 'email',
          identityMappingMode: 'user-email',
        },
      });

      const otherResult = await registerNew({
        firstName: 'Other',
        lastName: 'User',
        projectName: 'Other External Test Project',
        email: otherEmail,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0',
      });
      otherProject = otherResult.project;
      otherClient = await createClient(await getProjectSystemRepo(otherProject), {
        project: otherProject,
        name: 'Other External Auth Client',
        redirectUri,
        identityProvider: { ...identityProvider, identitySource: 'email', identityMappingMode: 'user-email' },
      });

      // Invite user with external ID
      await inviteUser({
        project,
        externalId,
        resourceType: 'Patient',
        firstName: 'External',
        lastName: 'User',
      });
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing code', async () => {
    const res = await request(app).get('/auth/external?code=&state=xyz');
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Missing code');
  });

  test('Missing state', async () => {
    const res = await request(app).get('/auth/external?code=xyz&state=');
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Missing state');
  });

  test('Unknown state', async () => {
    const res = await request(app).get('/auth/external?code=xyz&state=xyz');
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Invalid state');
  });

  test('Unknown domain', async () => {
    // Build the external callback URL with an unrecognized domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain: randomUUID() + '.example.com' }),
    });

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Missing identity provider', async () => {
    // Build the external callback URL for a domain without an identity provider
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain: domain2 }),
    });

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Unknown user', async () => {
    // Build the external callback URL with the known domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens('not-found@' + domain)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Missing email', async () => {
    // Build the external callback URL with the known domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(undefined)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('External token does not contain email address');
  });

  test('Email does not match domain', async () => {
    // Build the external callback URL with the known domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens('admin@medplum.com')));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Email address does not match domain');
  });

  test.each([
    `other@example.com,x@${domain}`,
    `x@${domain},other@example.com,x@${domain}`,
    `"x,other@example.com,y"@${domain}`,
  ])('Email with comma is not a list of users: %s', async (claim) => {
    // Build the external callback URL with the known domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(claim)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Domain with comma is not a list of domains', async () => {
    // Build the external callback URL with another domain in front of the known domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain: `example.com,${domain}` }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(`other@example.com,${domain}`)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('DomainConfiguration success', async () => {
    // Build the external callback URL
    // There are two required parameters: code and state
    // Code is an opaque value that is returned by the external identity provider
    // State is a JSON string with the original login request details
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual('localhost:3000');
    expect(redirect.pathname).toStrictEqual('/signin');
    expect(redirect.searchParams.get('login')).toBeTruthy();
  });

  test('Marks the user email verified', async () => {
    // Invited users start unverified, and external auth is the only login they have
    const verifiedEmail = `verify-${randomUUID()}@${domain}`;
    const { user } = await withTestContext(() =>
      inviteUser({
        project,
        email: verifiedEmail,
        resourceType: 'Practitioner',
        firstName: 'Verify',
        lastName: 'User',
        sendEmail: false,
      })
    );
    expect(user.emailVerified).toBeFalsy();

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(verifiedEmail)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    // The identity provider vouched for the account, so no separate proof is required
    const updated = await systemRepo.readResource<User>('User', user.id);
    expect(updated.emailVerified).toBe(true);
  });

  test('Does not rewrite an already verified user', async () => {
    const verifiedEmail = `verify-${randomUUID()}@${domain}`;
    const { user } = await withTestContext(() =>
      inviteUser({
        project,
        email: verifiedEmail,
        resourceType: 'Practitioner',
        firstName: 'Verify',
        lastName: 'User',
        sendEmail: false,
      })
    );
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(verifiedEmail)));

    const signIn = async (): Promise<void> => {
      const url = appendQueryParams('/auth/external', {
        code: randomUUID(),
        state: JSON.stringify({ domain }),
      });
      const res = await request(app).get(url);
      expect(res).toHaveStatus(302);
    };

    // The first login verifies the user, which is a real write
    await signIn();
    const afterFirst = await systemRepo.readResource<User>('User', user.id);
    expect(afterFirst.emailVerified).toBe(true);

    // The second applies the same patch, but it changes nothing, so isNotModified
    // short-circuits before writing and no new version is created
    await signIn();
    const afterSecond = await systemRepo.readResource<User>('User', user.id);
    expect(afterSecond.emailVerified).toBe(true);
    expect(afterSecond.meta?.versionId).toStrictEqual(afterFirst.meta?.versionId);
  });

  test('Server config identity provider success', async () => {
    const issuer = `https://${randomUUID()}.example.com`;
    const config = getConfig();
    const externalAuthProviders = config.externalAuthProviders;
    config.externalAuthProviders = [{ issuer, identityProvider }];

    try {
      const url = appendQueryParams('/auth/external', {
        code: randomUUID(),
        state: JSON.stringify({ issuer }),
      });

      // Mock the external identity provider
      fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

      // Simulate the external identity provider callback
      const res = await request(app).get(url);
      expect(res).toHaveStatus(302);

      const redirect = new URL(res.header.location);
      expect(redirect.host).toStrictEqual('localhost:3000');
      expect(redirect.pathname).toStrictEqual('/signin');
      expect(redirect.searchParams.get('login')).toBeTruthy();
    } finally {
      config.externalAuthProviders = externalAuthProviders;
    }
  });

  test('Callback iss parameter must match identity provider issuer', async () => {
    const issuer = `https://${randomUUID()}.example.com`;
    const config = getConfig();
    const externalAuthProviders = config.externalAuthProviders;
    config.externalAuthProviders = [{ issuer, identityProvider: { ...identityProvider, issuer } }];
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    try {
      const callback = (iss: string): Promise<request.Response> =>
        request(app).get(
          appendQueryParams('/auth/external', { code: randomUUID(), state: JSON.stringify({ issuer }), iss })
        );

      const mismatch = await callback('https://evil.example.com');
      expect(mismatch).toHaveStatus(400);
      expect(mismatch.body.issue[0].details.text).toBe('Invalid issuer');

      expect(await callback(issuer)).toHaveStatus(302);
    } finally {
      config.externalAuthProviders = externalAuthProviders;
    }
  });

  test('ClientApplication success', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual(domain);
    expect(redirect.pathname).toStrictEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });

  test('ClientApplication with DomainConfiguration success', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain, redirectUri, clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual(domain);
    expect(redirect.pathname).toStrictEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });

  test('Login is scoped to the client project across tenants', async () => {
    // A user who belongs only to a different project is not logged in through a
    // ClientApplication in another project. External login resolves the user by email
    // (including server-scoped users via getUserByEmailWithoutProject), but membership is
    // scoped to the client's project, so a user with no membership there results in
    // "User not found" and no authorization code is issued.
    const otherEmail = `other-${randomUUID()}@example.com`;
    await withTestContext(() =>
      registerNew({
        firstName: 'Other',
        lastName: 'User',
        projectName: 'Other Project ' + randomUUID(),
        email: otherEmail,
        password: 'password!@#',
        remoteAddress: '6.6.6.6',
        userAgent: 'Mozilla/5.0',
      })
    );

    // The user is server-scoped, and so is resolvable by email with no project.
    const otherUser = await withTestContext(() => getUserByEmailWithoutProject(otherEmail));
    expect(otherUser).toBeDefined();

    // Drive the callback with a client from a different project and a token asserting the
    // other user's email.
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(otherEmail)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('id_token verification rejects invalid tokens', async () => {
    // Missing id_token in the token endpoint response.
    const noJwksUrl = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });
    fetchMock.mockImplementation(() => mockFetchJson({}));
    let res = await request(app).get(noJwksUrl);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Missing id_token in external identity provider response');

    const jwksClient = await withTestContext(() =>
      createClient(systemRepo, { project, name: 'JWKS Client', redirectUri })
    );
    const idp = {
      ...identityProvider,
      jwksUrl: 'https://issuer.example.com/.well-known/jwks.json',
      identitySource: 'email' as const,
      identityMappingMode: 'user-email' as const,
    };
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: jwksClient.id }),
    });
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // JWKS configured without an issuer.
    await withTestContext(() => systemRepo.updateResource<ClientApplication>({ ...jwksClient, identityProvider: idp }));
    res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Missing issuer for external identity provider');

    // Issuer configured, but the (unsigned) token does not verify against the JWKS.
    await withTestContext(() =>
      systemRepo.updateResource<ClientApplication>({
        ...jwksClient,
        identityProvider: { ...idp, issuer: 'https://issuer.example.com' },
      })
    );
    res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Failed to verify code - check your identity provider configuration');
  });

  test('id_token that verifies against the JWKS is accepted', async () => {
    const issuer = 'https://issuer.example.com';
    const jwksUrl = 'https://issuer.example.com/.well-known/verified-jwks.json';
    const keyPair = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(keyPair.publicKey);

    const jwksClient = await withTestContext(() =>
      createClient(systemRepo, { project, name: 'JWKS Verified Client', redirectUri })
    );
    await withTestContext(() =>
      systemRepo.updateResource<ClientApplication>({
        ...jwksClient,
        identityProvider: {
          ...identityProvider,
          issuer,
          jwksUrl,
          identitySource: 'email',
          identityMappingMode: 'user-email',
        },
      })
    );

    const signIdToken = (audience: string): Promise<string> =>
      new SignJWT({ email })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime('2h')
        .sign(keyPair.privateKey);

    // The token endpoint returns the signed token; the JWKS endpoint returns the public key.
    const mockIdToken = (jwt: string): void => {
      fetchMock.mockImplementation((input: any) =>
        String(input).includes('verified-jwks')
          ? mockFetchJson({ keys: [publicJwk] })
          : mockFetchJson({ id_token: jwt })
      );
    };
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: jwksClient.id }),
    });

    // Audience defaults to the IdP client ID, so a token audienced to it is accepted.
    mockIdToken(await signIdToken(identityProvider.clientId));
    let res = await request(app).get(url);
    expect(res).toHaveStatus(302);
    expect(new URL(res.header.location).searchParams.get('code')).toBeTruthy();

    // A token audienced to a different relying party is rejected.
    mockIdToken(await signIdToken('some-other-client'));
    res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Failed to verify code - check your identity provider configuration');
  });

  test('Invalid client', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: defaultClient.id }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Client callback path success', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    const url = appendQueryParams(`/auth/external/${otherClient.id}`, {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: otherClient.id }),
    });
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(otherEmail)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);
    expect(new URL(res.header.location).searchParams.get('code')).toBeTruthy();

    // The token request repeats the per-client redirect URI
    const body = new URLSearchParams(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.get('redirect_uri')).toBe(getConfig().baseUrl + 'auth/external/' + otherClient.id);
    expect(warnSpy).not.toHaveBeenCalledWith(
      'Client identity provider signed in through the shared external auth callback',
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  test('Shared callback path logs client identity provider sign-ins', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);
    expect(warnSpy).toHaveBeenCalledWith(
      'Client identity provider signed in through the shared external auth callback',
      { clientId: externalAuthClient.id, projectId: project.id }
    );
    warnSpy.mockRestore();
  });

  test('Shared callback path requires the legacyExternalAuth system setting', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: otherClient.id }),
    });
    fetchMock.mockClear();

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe(
      `Client identity provider must use the per-client callback ${getConfig().baseUrl}auth/external/${otherClient.id}`
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Client identity provider refused on the shared external auth callback', {
      clientId: otherClient.id,
      projectId: otherProject.id,
    });
    warnSpy.mockRestore();

    // A Project admin cannot enable it through Project.setting
    await withTestContext(async () => {
      const otherRepo = await getProjectSystemRepo(otherProject);
      otherProject = await otherRepo.updateResource<Project>({
        ...otherProject,
        setting: [{ name: 'legacyExternalAuth', valueBoolean: true }],
      });
    });
    const res2 = await request(app).get(url);
    expect(res2).toHaveStatus(400);
    expect(fetchMock).not.toHaveBeenCalled();

    await withTestContext(async () => {
      const otherRepo = await getProjectSystemRepo(otherProject);
      otherProject = await otherRepo.updateResource<Project>({ ...otherProject, setting: undefined });
    });
  });

  test('Shared callback path allows client identity providers without a project', async () => {
    const projectlessClient = await withTestContext(() =>
      getGlobalSystemRepo().createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        name: 'Projectless External Auth Client',
        identityProvider,
      })
    );
    expect(projectlessClient.meta?.project).toBeUndefined();

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ clientId: projectlessClient.id }),
    });
    fetchMock.mockClear();
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);
    expect(fetchMock).toHaveBeenCalled();
  });

  test('Client callback path requires the state client', async () => {
    const url = appendQueryParams(`/auth/external/${externalAuthClient.id}`, {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: defaultClient.id }),
    });
    fetchMock.mockClear();

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Invalid client');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Client callback path does not fall back to other identity providers', async () => {
    const url = appendQueryParams(`/auth/external/${defaultClient.id}`, {
      code: randomUUID(),
      state: JSON.stringify({ domain, redirectUri, clientId: defaultClient.id }),
    });
    fetchMock.mockClear();

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Missing token URL', async () => {
    const client = await createClient(systemRepo, {
      project,
      name: 'Missing Token URL',
      redirectUri,
      identityProvider: {
        ...identityProvider,
        tokenUrl: undefined,
      },
    });
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: client.id }),
    });

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Missing token URL for external identity provider');
  });

  test('Client secret post requires client credentials', async () => {
    const client = await createClient(systemRepo, {
      project,
      name: 'Missing Client Credentials',
      redirectUri,
      identityProvider: {
        ...identityProvider,
        tokenAuthMethod: OAuthTokenAuthMethod.ClientSecretPost,
        clientId: undefined,
        clientSecret: undefined,
      },
    });
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: client.id }),
    });

    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Missing client ID or client secret for external identity provider');
  });

  test('Invalid project', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id, projectId: randomUUID() }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Invalid project');
  });

  test('Invalid redirect URI', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri: 'https://nope.example.com', clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Invalid redirect URI');
  });

  test('Invalid token request', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchText('invalid', { contentType: ContentType.JSON }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Failed to verify code - check your identity provider configuration');
  });

  test('Token request includes Accept-Encoding: identity', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    await request(app).get(url);

    // Verify fetch was called with Accept-Encoding: identity to prevent gzip responses
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept-Encoding': 'identity',
        }),
      })
    );
  });

  test('Insecure token URL is passed to fetch', async () => {
    const insecureAuthClient = await withTestContext(async () => {
      const client = await createClient(systemRepo, {
        project,
        name: 'Insecure External Auth Client',
        redirectUri,
      });
      return systemRepo.updateResource<ClientApplication>({
        ...client,
        identityProvider: {
          ...identityProvider,
          tokenUrl: 'http://localhost:8080/oauth2/token',
        },
      });
    });
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: insecureAuthClient.id }),
    });

    fetchMock.mockImplementation(() => mockFetchJson(buildTokens('test@' + domain)));
    fetchMock.mockClear();
    await request(app).get(url);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/oauth2/token',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('Subject auth success', async () => {
    const subjectAuthClient = await withTestContext(async () => {
      // Create a new client application with external subject auth
      const client = await createClient(systemRepo, {
        project,
        name: 'Subject Auth Client',
        redirectUri,
      });

      // Update client application with external auth
      await systemRepo.updateResource<ClientApplication>({
        ...client,
        identityProvider: {
          ...identityProvider,
          identitySource: 'subject',
          identityMappingMode: 'project-membership-external-id',
        },
      });

      return client;
    });

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({
        redirectUri,
        clientId: subjectAuthClient.id,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens('', externalId)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual(domain);
    expect(redirect.pathname).toStrictEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();

    const code = redirect.searchParams.get('code');
    const tokenResponse = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      code_verifier: 'xyz',
    });
    expect(tokenResponse.body.profile.display).toBe('External User');
  });

  test('Block partial redirect URI match', async () => {
    const subjectAuthClient = await withTestContext(async () => {
      // Create a new client application with external subject auth
      const client = await createClient(systemRepo, {
        project,
        name: 'Subject Auth Client',
        redirectUri,
      });

      // Update client application with external auth
      await systemRepo.updateResource<ClientApplication>({
        ...client,
        identityProvider: {
          ...identityProvider,
          useSubject: true,
        },
      });

      return client;
    });

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({
        redirectUri: redirectUri + '/extra',
        clientId: subjectAuthClient.id,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens('', externalId)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Invalid redirect URI');
  });

  test('Block redirect URI with different host', async () => {
    const subjectAuthClient = await withTestContext(async () => {
      // Create a new client application with external subject auth
      const client = await createClient(systemRepo, {
        project,
        name: 'Subject Auth Client',
        redirectUri,
      });

      // Update client application with external auth
      await systemRepo.updateResource<ClientApplication>({
        ...client,
        identityProvider: {
          ...identityProvider,
          useSubject: true,
        },
      });

      return client;
    });

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({
        redirectUri: redirectUri + '.evil.com',
        clientId: subjectAuthClient.id,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens('', externalId)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('Invalid redirect URI');
  });

  test('Missing subject', async () => {
    const subjectAuthClient = await withTestContext(async () => {
      // Create a new client application with external subject auth
      const client = await createClient(systemRepo, {
        project,
        name: 'Subject Auth Client',
        redirectUri,
      });

      // Update client application with external auth
      await systemRepo.updateResource<ClientApplication>({
        ...client,
        identityProvider: {
          ...identityProvider,
          useSubject: true,
        },
      });

      return client;
    });

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({
        redirectUri,
        clientId: subjectAuthClient.id,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(undefined, '')));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toBe('External token does not contain subject');
  });

  test('Client secret post', async () => {
    const clientSecretPostClient = await withTestContext(async () => {
      // Create a new client application with external subject auth
      const client = await createClient(systemRepo, {
        project,
        name: 'Client secret post Client',
        redirectUri,
      });

      // Update client application with external auth
      await systemRepo.updateResource<ClientApplication>({
        ...client,
        identityProvider: {
          ...identityProvider,
          tokenAuthMethod: OAuthTokenAuthMethod.ClientSecretPost,
        },
      });

      return client;
    });

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      // state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
      state: JSON.stringify({
        redirectUri,
        clientId: clientSecretPostClient.id,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual(domain);
    expect(redirect.pathname).toStrictEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();

    const code = redirect.searchParams.get('code');
    const tokenResponse = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      code_verifier: 'xyz',
    });
    expect(tokenResponse.body.profile.display).toBe('External Text');
  });

  test('returnTo URL is followed when explicitly allowed by DomainConfiguration', async () => {
    const testDomain = randomUUID() + '.example.com';
    const testEmail = `text@${testDomain}`;
    const allowedReturnTo = 'https://myapp.example.com';

    await withTestContext(async () => {
      // Create a new project and user for this test
      const { project: testProject } = await registerNew({
        firstName: 'External',
        lastName: 'Text',
        projectName: 'External Test Project - returnTo',
        email: testEmail,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      });

      const testRepo = await getProjectSystemRepo(testProject);
      await testRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain: testDomain,
        identityProvider,
        allowedPostLoginRedirectUrls: [allowedReturnTo],
      });
    });

    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain: testDomain, returnTo: allowedReturnTo + '/dashboard' }),
    });

    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(testEmail)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.hostname).toStrictEqual('myapp.example.com');
    expect(redirect.pathname).toStrictEqual('/dashboard');
    expect(redirect.searchParams.get('login')).toBeTruthy();
  });

  test('returnTo URL is ignored when not in allowedPostLoginRedirectUrls', async () => {
    // The domain config for `domain` has no allowedPostLoginRedirectUrls,
    // so any returnTo should be ignored and the user falls back to /signin.
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain, returnTo: 'https://evil.example.com/steal' }),
    });

    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual('localhost:3000');
    expect(redirect.pathname).toStrictEqual('/signin');
    expect(redirect.searchParams.get('login')).toBeTruthy();
  });

  test('returnTo URL with confused domain is rejected', async () => {
    const testDomain = randomUUID() + '.example.com';
    const testEmail = `text@${testDomain}`;
    const allowedReturnTo = 'https://myapp.example.com';

    await withTestContext(async () => {
      const { project: testProject } = await registerNew({
        firstName: 'External',
        lastName: 'Text',
        projectName: 'External Test Project - confused domain',
        email: testEmail,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      });

      const testRepo = await getProjectSystemRepo(testProject);
      await testRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain: testDomain,
        identityProvider,
        allowedPostLoginRedirectUrls: [allowedReturnTo],
      });
    });

    // Attempt to use a confused domain that starts with the allowed URL
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({
        domain: testDomain,
        returnTo: 'https://myapp.example.com.evil.com/steal',
      }),
    });

    fetchMock.mockImplementation(() => mockFetchJson(buildTokens(testEmail)));

    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    // Should fall back to default signin, NOT redirect to evil.com
    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual('localhost:3000');
    expect(redirect.pathname).toStrictEqual('/signin');
  });

  test('Legacy User.externalId support', async () => {
    const externalId = randomUUID();
    const domain = `${randomUUID()}.example.com`;
    const redirectUri = `https://${domain}/auth/callback`;
    const client = await withTestContext(async () => {
      // Create a new project
      const { project, client } = await registerNew({
        firstName: 'External',
        lastName: 'Text',
        projectName: 'External Test Project',
        email,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      });

      // Update client application with external auth
      const client2 = await systemRepo.updateResource<ClientApplication>({
        ...client,
        redirectUris: [redirectUri],
        identityProvider: {
          authorizeUrl: 'https://example.com/oauth2/authorize',
          tokenUrl: 'https://example.com/oauth2/token',
          userInfoUrl: 'https://example.com/oauth2/userinfo',
          clientId: '123',
          clientSecret: '456',
          useSubject: true,
        },
      });

      // Invite user with external ID
      const { user, membership } = await inviteUser({
        project,
        externalId,
        resourceType: 'Patient',
        firstName: 'External',
        lastName: 'User',
      });

      // In current code, externalId will be stored in the membership
      expect(user.externalId).toBeUndefined();
      expect(membership.externalId).toBe(externalId);

      // Simulate legacy behavior by moving externalId to the user
      const updatedUser = await systemRepo.updateResource<User>({ ...user, externalId });
      expect(updatedUser.externalId).toStrictEqual(externalId);
      await systemRepo.updateResource<ProjectMembership>({ ...membership, externalId: undefined });
      return client2;
    });

    // Now try to login with the external ID
    const url = appendQueryParams(`/auth/external/${client.id}`, {
      code: randomUUID(),
      state: JSON.stringify({ clientId: client.id, redirectUri }),
    });

    // Mock the external identity provider
    fetchMock.mockImplementation(() => mockFetchJson(buildTokens('', externalId)));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res).toHaveStatus(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toStrictEqual(domain);
    expect(redirect.pathname).toStrictEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });

  describe('Start', () => {
    const codeChallenge = 'app-code-challenge';
    const codeChallengeMethod = 'S256';

    async function start(body: Record<string, unknown>): Promise<request.Response> {
      return request(app).post('/auth/external/start').type('json').send(body);
    }

    async function startState(body: Record<string, unknown>): Promise<string> {
      const res = await start(body);
      expect(res).toHaveStatus(200);
      return new URL(res.body.url).searchParams.get('state') as string;
    }

    const pkce = { codeChallenge, codeChallengeMethod };
    test.each<[string, () => Record<string, unknown>, string]>([
      ['missing code challenge', () => ({ clientId: otherClient.id, codeChallengeMethod }), 'Missing code challenge'],
      [
        'plain code challenge',
        () => ({ clientId: otherClient.id, codeChallenge, codeChallengeMethod: 'plain' }),
        'Invalid code challenge method',
      ],
      [
        'unregistered redirect URI',
        () => ({ ...pkce, clientId: otherClient.id, redirectUri: 'https://example.com/other' }),
        'Invalid redirect URI',
      ],
      [
        'project of another client',
        () => ({ ...pkce, clientId: otherClient.id, projectId: project.id }),
        'Invalid project',
      ],
      [
        'returnTo not allowed by the domain',
        () => ({ ...pkce, domain, returnTo: 'https://example.com/' }),
        'Invalid returnTo URL',
      ],
      ['domain without identity provider', () => ({ ...pkce, domain: domain2 }), 'Identity provider not found'],
      [
        'client without identity provider',
        () => ({ ...pkce, clientId: defaultClient.id }),
        'Identity provider not found',
      ],
      ['non-string field', () => ({ ...pkce, domain, returnTo: ['https://example.com/'] }), 'Invalid value'],
      ['oversized field', () => ({ ...pkce, domain, nonce: 'x'.repeat(4097) }), 'Invalid value'],
    ])('Start rejects %s', async (_name, buildBody, message) => {
      const res = await start(buildBody());
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toBe(message);
    });

    test('Client identity provider round trip', async () => {
      const res = await start({ clientId: otherClient.id, redirectUri, codeChallenge, codeChallengeMethod });
      expect(res).toHaveStatus(200);

      const url = new URL(res.body.url);
      expect(url.origin + url.pathname).toBe(identityProvider.authorizeUrl);
      expect(url.searchParams.get('client_id')).toBe(identityProvider.clientId);
      expect(url.searchParams.get('redirect_uri')).toBe(getConfig().baseUrl + 'auth/external/' + otherClient.id);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.has('code_challenge')).toBe(false);
      const state = url.searchParams.get('state') as string;
      expect(state).toMatch(/^[\w-]{43}$/);

      fetchMock.mockClear();
      fetchMock.mockImplementation(() => mockFetchJson(buildTokens(otherEmail)));
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');

      // Login fields in the callback URL are ignored
      const callbackUrl = appendQueryParams(`/auth/external/${otherClient.id}`, {
        code: randomUUID(),
        state,
        code_challenge: 'other-code-challenge',
      });
      const res2 = await request(app).get(callbackUrl);
      expect(res2).toHaveStatus(302);
      const redirect = new URL(res2.header.location);
      expect(redirect.origin + redirect.pathname).toBe(redirectUri);
      expect(redirect.searchParams.get('code')).toBeTruthy();

      const login = await systemRepo.readResource<Login>('Login', redirect.searchParams.get('login') as string);
      expect(login.codeChallenge).toBe(codeChallenge);
      expect(login.codeChallengeMethod).toBe(codeChallengeMethod);

      // No identity provider PKCE configured
      const tokenBody = new URLSearchParams(fetchMock.mock.calls[0][1]?.body as string);
      expect(tokenBody.has('code_verifier')).toBe(false);
      expect(warnSpy).not.toHaveBeenCalledWith('External auth signed in with JSON state', expect.anything());
      warnSpy.mockRestore();

      // Single use
      const res3 = await request(app).get(callbackUrl);
      expect(res3).toHaveStatus(400);
      expect(res3.body.issue[0].details.text).toBe('Invalid state');
    });

    test('Identity provider PKCE uses a server-side verifier', async () => {
      const pkceClient = await createClient(await getProjectSystemRepo(otherProject), {
        project: otherProject,
        name: 'PKCE External Auth Client',
        redirectUri,
        identityProvider: {
          ...identityProvider,
          usePkce: true,
          identitySource: 'email',
          identityMappingMode: 'user-email',
        },
      });

      const res = await start({ clientId: pkceClient.id, codeChallenge, codeChallengeMethod });
      expect(res).toHaveStatus(200);
      const url = new URL(res.body.url);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');

      fetchMock.mockClear();
      fetchMock.mockImplementation(() => mockFetchJson(buildTokens(otherEmail)));
      const res2 = await request(app).get(
        appendQueryParams(`/auth/external/${pkceClient.id}`, {
          code: randomUUID(),
          state: url.searchParams.get('state') as string,
        })
      );
      expect(res2).toHaveStatus(302);

      const tokenBody = new URLSearchParams(fetchMock.mock.calls[0][1]?.body as string);
      expect(hashCode(tokenBody.get('code_verifier') as string)).toBe(url.searchParams.get('code_challenge'));
    });

    test('Domain identity provider round trip', async () => {
      const res = await start({ domain, codeChallenge, codeChallengeMethod, scope: 'openid' });
      expect(res).toHaveStatus(200);
      const url = new URL(res.body.url);
      expect(url.searchParams.get('redirect_uri')).toBe(getConfig().baseUrl + 'auth/external');
      expect(url.searchParams.get('scope')).toBe('openid profile email');

      fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));
      const res2 = await request(app).get(
        appendQueryParams('/auth/external', { code: randomUUID(), state: url.searchParams.get('state') as string })
      );
      expect(res2).toHaveStatus(302);
      const redirect = new URL(res2.header.location);
      expect(redirect.pathname).toBe('/signin');
      expect(redirect.searchParams.get('scope')).toBe('openid');
      expect(redirect.searchParams.get('code_challenge')).toBe(codeChallenge);
    });

    test('Server config identity provider round trip', async () => {
      const issuer = `https://${randomUUID()}.example.com`;
      const config = getConfig();
      const externalAuthProviders = config.externalAuthProviders;
      config.externalAuthProviders = [{ issuer, identityProvider }];
      try {
        const res = await start({ issuer, codeChallenge, codeChallengeMethod });
        expect(res).toHaveStatus(200);
        const url = new URL(res.body.url);
        expect(url.searchParams.get('redirect_uri')).toBe(getConfig().baseUrl + 'auth/external');

        fetchMock.mockImplementation(() => mockFetchJson(buildTokens(email)));
        const res2 = await request(app).get(
          appendQueryParams('/auth/external', { code: randomUUID(), state: url.searchParams.get('state') as string })
        );
        expect(res2).toHaveStatus(302);
        expect(new URL(res2.header.location).searchParams.get('code_challenge')).toBe(codeChallenge);
      } finally {
        config.externalAuthProviders = externalAuthProviders;
      }
    });

    test('State expires', async () => {
      const state = await startState({ domain, codeChallenge, codeChallengeMethod });
      const ttl = await getCacheRedis().ttl('medplum:external-auth-state:' + state);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(EXTERNAL_AUTH_STATE_TTL_SECONDS);
    });

    test('Callback path must match the stored path', async () => {
      fetchMock.mockClear();

      const state = await startState({ clientId: otherClient.id, codeChallenge, codeChallengeMethod });
      const res = await request(app).get(appendQueryParams('/auth/external', { code: randomUUID(), state }));
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toBe('Invalid client');

      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('JSON state sign-ins are logged', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');
      fetchMock.mockImplementation(() => mockFetchJson(buildTokens(otherEmail)));
      const res = await request(app).get(
        appendQueryParams(`/auth/external/${otherClient.id}`, {
          code: randomUUID(),
          state: JSON.stringify({ redirectUri, clientId: otherClient.id }),
        })
      );
      expect(res).toHaveStatus(302);
      expect(warnSpy).toHaveBeenCalledWith('External auth signed in with JSON state', {
        clientId: otherClient.id,
        projectId: otherProject.id,
        domain: undefined,
        issuer: undefined,
        callback: 'per-client',
      });
      warnSpy.mockRestore();
    });
  });
});

/**
 * Returns fake tokens to mock the external identity provider.
 * @param email - The user email address to include in the ID token.
 * @param sub - The user subject to include as the sub claim.
 * @returns Fake tokens to mock the external identity provider.
 */
function buildTokens(email: string | undefined, sub?: string): Record<string, string> {
  return {
    id_token: 'header.' + Buffer.from(JSON.stringify({ email, sub }), 'ascii').toString('base64') + '.signature',
  };
}

function appendQueryParams(path: string, params: Record<string, string>): string {
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  const url = new URL(`http://example.com${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString().replace('http://example.com', '');
}
