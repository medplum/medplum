import { DomainConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { registerNew } from './register';

jest.mock('node-fetch');

const app = express();
const domain = randomUUID() + '.example.com';
const email = `text@${domain}`;
const domain2 = randomUUID() + '.example.com';

describe('External', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // Create a new project
    await registerNew({
      firstName: 'External',
      lastName: 'Text',
      projectName: 'External Test Project',
      email,
      password: 'password!@#',
      remoteAddress: '5.5.5.5',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
    });

    // Create a domain configuration with external identity provider
    await systemRepo.createResource<DomainConfiguration>({
      resourceType: 'DomainConfiguration',
      domain,
      identityProvider: {
        authorizeUrl: 'https://example.com/oauth2/authorize',
        tokenUrl: 'https://example.com/oauth2/token',
        userInfoUrl: 'https://example.com/oauth2/userinfo',
        clientId: '123',
        clientSecret: '456',
      },
    });

    // Create a domain configuration without an external identity provider
    await systemRepo.createResource<DomainConfiguration>({
      resourceType: 'DomainConfiguration',
      domain: domain2,
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
    expect(res.body.issue[0].details.text).toBe('Domain not found');
  });

  test('Missing identity provider', async () => {
    // Build the external callback URL for a domain without an identity provider
    const url = new URL('https://example.com/auth/external');
    url.searchParams.set('code', randomUUID());
    url.searchParams.set('state', JSON.stringify({ domain: domain2 }));

    const res = await request(app).get(url.toString().replace('https://example.com', ''));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Domain does not support external authentication');
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

  test('Success', async () => {
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
});

/**
 * Returns fake tokens to mock the external identity provider.
 * @param email The user email address to include in the ID token.
 * @returns Fake tokens to mock the external identity provider.
 */
function buildTokens(email: string): Record<string, string> {
  return {
    id_token: 'header.' + Buffer.from(JSON.stringify({ email }), 'ascii').toString('base64') + '.signature',
  };
}
