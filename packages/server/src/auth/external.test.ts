import { OAuthTokenAuthMethod } from '@medplum/core';
import { ClientApplication, DomainConfiguration, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import fetch from 'node-fetch';
import request from 'supertest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

jest.mock('node-fetch');

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

let project: Project;
let defaultClient: ClientApplication;
let externalAuthClient: ClientApplication;

describe('External', () => {
  beforeAll(() =>
    withTestContext(async () => {
      const config = await loadTestConfig();
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

      const systemRepo = getSystemRepo();

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
        identityProvider,
      });

      // Invite user with external ID
      await inviteUser({
        project,
        externalId,
        resourceType: 'Patient',
        firstName: 'External',
        lastName: 'User',
      });
    })
  );

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing code', async () => {
    const res = await request(app).get('/auth/external?code=&state=xyz');
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Missing code');
  });

  test('Missing state', async () => {
    const res = await request(app).get('/auth/external?code=xyz&state=');
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Missing state');
  });

  test('Invalid JSON state', async () => {
    const res = await request(app).get('/auth/external?code=xyz&state=xyz');
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid state');
  });

  test('Unknown domain', async () => {
    // Build the external callback URL with an unrecognized domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain: randomUUID() + '.example.com' }),
    });

    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Missing identity provider', async () => {
    // Build the external callback URL for a domain without an identity provider
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain: domain2 }),
    });

    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Unknown user', async () => {
    // Build the external callback URL with the known domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens('not-found@' + domain),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Email does not match domain', async () => {
    // Build the external callback URL with the known domain
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens('admin@medplum.com'),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
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
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual('localhost:3000');
    expect(redirect.pathname).toEqual('/signin');
    expect(redirect.searchParams.get('login')).toBeTruthy();
  });

  test('ClientApplication success', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });

  test('ClientApplication with DomainConfiguration success', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ domain, redirectUri, clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });

  test('Invalid client', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: defaultClient.id }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Invalid project', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id, projectId: randomUUID() }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid project');
  });

  test('Invalid redirect URI', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri: 'https://nope.example.com', clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid redirect URI');
  });

  test('Invalid token request', async () => {
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ redirectUri, clientId: externalAuthClient.id }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => {
        throw new Error('Invalid JSON');
      },
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Failed to verify code - check your identity provider configuration');
  });

  test('Subject auth success', async () => {
    const subjectAuthClient = await withTestContext(async () => {
      const systemRepo = getSystemRepo();

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
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens('', externalId),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();

    const code = redirect.searchParams.get('code');
    const tokenResponse = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      code_verifier: 'xyz',
    });
    expect(tokenResponse.body.profile.display).toBe('External User');
  });

  test('Client secret post', async () => {
    const clientSecretPostClient = await withTestContext(async () => {
      const systemRepo = getSystemRepo();

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
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();

    const code = redirect.searchParams.get('code');
    const tokenResponse = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      code_verifier: 'xyz',
    });
    expect(tokenResponse.body.profile.display).toBe('External Text');
  });

  test('Legacy User.externalId support', async () => {
    const externalId = randomUUID();
    const domain = `${randomUUID()}.example.com`;
    const redirectUri = `https://${domain}/auth/callback`;
    const client = await withTestContext(async () => {
      const systemRepo = getSystemRepo();

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
        redirectUri,
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
      expect(updatedUser.externalId).toEqual(externalId);
      await systemRepo.updateResource<ProjectMembership>({ ...membership, externalId: undefined });
      return client2;
    });

    // Now try to login with the external ID
    const url = appendQueryParams('/auth/external', {
      code: randomUUID(),
      state: JSON.stringify({ clientId: client.id, redirectUri }),
    });

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      ok: true,
      status: 200,
      json: () => buildTokens('', externalId),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url);
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });
});

/**
 * Returns fake tokens to mock the external identity provider.
 * @param email - The user email address to include in the ID token.
 * @param sub - The user subject to include as the sub claim.
 * @returns Fake tokens to mock the external identity provider.
 */
function buildTokens(email: string, sub?: string): Record<string, string> {
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
