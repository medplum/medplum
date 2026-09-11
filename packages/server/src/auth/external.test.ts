// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, OAuthTokenAuthMethod } from '@medplum/core';
import type { ClientApplication, DomainConfiguration, Project, ProjectMembership, User } from '@medplum/fhirtypes';
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
import { getProjectSystemRepo } from '../fhir/repo';
import { getUserByEmailWithoutProject } from '../oauth/utils';
import { withTestContext } from '../test.setup';
import { mockFetchJson, mockFetchText } from '../test.setup.fetch';
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
      project = registerResult.project;
      defaultClient = registerResult.client;

      systemRepo = await getProjectSystemRepo(project);

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

  test('Invalid JSON state', async () => {
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
        String(input).includes('verified-jwks') ? mockFetchJson({ keys: [publicJwk] }) : mockFetchJson({ id_token: jwt })
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
    const url = appendQueryParams('/auth/external', {
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
