import { ClientApplication, DomainConfiguration, ProjectMembership, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import fetch from 'node-fetch';
import request from 'supertest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { registerNew } from './register';

jest.mock('node-fetch');

const app = express();
const domain = randomUUID() + '.example.com';
const email = `text@${domain}`;
const domain2 = randomUUID() + '.example.com';
const redirectUri = `https://${domain}/auth/callback`;
const externalId = `google-oauth2|${randomUUID()}`;
let defaultClient: ClientApplication;
let externalAuthClient: ClientApplication;
let subjectAuthClient: ClientApplication;

describe('External', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

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
    defaultClient = client;

    const identityProvider = {
      authorizeUrl: 'https://example.com/oauth2/authorize',
      tokenUrl: 'https://example.com/oauth2/token',
      userInfoUrl: 'https://example.com/oauth2/userinfo',
      clientId: '123',
      clientSecret: '456',
    };

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

    // Create a new client application with external subject auth
    subjectAuthClient = await createClient(systemRepo, {
      project,
      name: 'Subject Auth Client',
      redirectUri,
    });

    // Update client application with external auth
    await systemRepo.updateResource<ClientApplication>({
      ...subjectAuthClient,
      identityProvider: {
        ...identityProvider,
        useSubject: true,
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

  test('Unknown domain', async () => {
    // Build the external callback URL with an unrecognized domain
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set('state', JSON.stringify({ domain: randomUUID() + '.example.com' }));

    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Missing identity provider', async () => {
    // Build the external callback URL for a domain without an identity provider
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set('state', JSON.stringify({ domain: domain2 }));

    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Unknown user', async () => {
    // Build the external callback URL with the known domain
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set('state', JSON.stringify({ domain }));

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens('not-found@' + domain),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('Email does not match domain', async () => {
    // Build the external callback URL with the known domain
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set('state', JSON.stringify({ domain }));

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens('admin@medplum.com'),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Email address does not match domain');
  });

  test('DomainConfiguration success', async () => {
    // Build the external callback URL
    // There are two required parameters: code and state
    // Code is an opaque value that is returned by the external identity provider
    // State is a JSON string with the original login request details
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set('state', JSON.stringify({ domain }));

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual('localhost:3000');
    expect(redirect.pathname).toEqual('/signin');
    expect(redirect.searchParams.get('login')).toBeTruthy();
  });

  test('ClientApplication success', async () => {
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        clientId: externalAuthClient.id,
        redirectUri,
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });

  test('ClientApplication with DomainConfiguration success', async () => {
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        domain,
        clientId: externalAuthClient.id,
        redirectUri,
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });

  test('Invalid client', async () => {
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        clientId: defaultClient.id,
        redirectUri,
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Identity provider not found');
  });

  test('Invalid project', async () => {
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        projectId: randomUUID(),
        clientId: externalAuthClient.id,
        redirectUri,
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid project');
  });

  test('Invalid redirect URI', async () => {
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        clientId: externalAuthClient.id,
        redirectUri: 'https://nope.example.com',
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens(email),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Invalid redirect URI');
  });

  test('Invalid token request', async () => {
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        clientId: externalAuthClient.id,
        redirectUri: 'https://nope.example.com',
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => {
        throw new Error('Invalid JSON');
      },
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Failed to verify code - check your identity provider configuration');
  });

  test('Subject auth success', async () => {
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        clientId: subjectAuthClient.id,
        redirectUri,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens('', externalId),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
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

  test('Legacy User.externalId support', async () => {
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
    const domain = `${randomUUID()}.example.com`;
    const redirectUri = `https://${domain}/auth/callback`;
    await systemRepo.updateResource<ClientApplication>({
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
    const externalId = randomUUID();
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
    await systemRepo.updateResource<User>({ ...user, externalId });
    await systemRepo.updateResource<ProjectMembership>({ ...membership, externalId: undefined });

    // Now try to login with the external ID
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set(
      'state',
      JSON.stringify({
        clientId: client.id,
        redirectUri,
      })
    );

    // Mock the external identity provider
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => buildTokens('', externalId),
    }));

    // Simulate the external identity provider callback
    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(302);

    const redirect = new URL(res.header.location);
    expect(redirect.host).toEqual(domain);
    expect(redirect.pathname).toEqual('/auth/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
  });
});

/**
 * Returns fake tokens to mock the external identity provider.
 * @param email The user email address to include in the ID token.
 * @returns Fake tokens to mock the external identity provider.
 */
function buildTokens(email: string, sub?: string): Record<string, string> {
  return {
    id_token: 'header.' + Buffer.from(JSON.stringify({ email, sub }), 'ascii').toString('base64') + '.signature',
  };
}
