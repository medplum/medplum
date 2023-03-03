import { createReference, parseSearchDefinition } from '@medplum/core';
import { AccessPolicy, ClientApplication, Login, Project, SmartAppLaunch } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { setPassword } from '../auth/setpassword';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { generateSecret } from './keys';
import { hashCode } from './token';

jest.mock('jose', () => {
  const core = jest.requireActual('@medplum/core');
  const original = jest.requireActual('jose');
  return {
    ...original,
    jwtVerify: jest.fn((credential: string) => {
      const payload = core.parseJWTPayload(credential);
      if (payload.invalid) {
        throw new Error('Verification failed');
      }
      return { payload };
    }),
  };
});

const app = express();
const email = randomUUID() + '@example.com';
const password = randomUUID();
let config: MedplumServerConfig;
let project: Project;
let client: ClientApplication;
let pkceOptionalClient: ClientApplication;

describe('OAuth2 Token', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);

    // Create a test project
    ({ project, client } = await createTestProject());

    // Create a 2nd client with PKCE optional
    pkceOptionalClient = await systemRepo.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      pkceOptional: true,
    });

    // Create access policy
    const accessPolicy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: '*' }],
      ipAccessRule: [
        { name: 'Block test', value: '6.6.6.6', action: 'block' },
        { name: 'Allow by default', value: '*', action: 'allow' },
      ],
    });

    // Create a test user
    const { user, membership } = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      email,
    });

    // Set the access policy
    await systemRepo.updateResource({
      ...membership,
      accessPolicy: createReference(accessPolicy),
    });

    // Set the test user password
    await setPassword(user, password);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Token with wrong Content-Type', async () => {
    const res = await request(app).post('/oauth2/token').type('json').send({
      foo: 'bar',
    });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Unsupported content type');
  });

  test('Token with missing grant type', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: '',
      code: 'fake-code',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing grant_type');
  });

  test('Token with unsupported grant type', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'xyz',
      code: 'fake-code',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Unsupported grant_type');
  });

  test('Token for client credentials success', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.access_token).toBeDefined();
  });

  test('Token for client credentials with missing client_id', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: '',
      client_secret: 'big-long-string',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing client_id');
  });

  test('Token for client credentials with missing client_secret', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing client_secret');
  });

  test('Token for client credentials with wrong client_id', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: randomUUID(),
      client_secret: 'big-long-string',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token for client credentials with wrong client_secret', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: 'wrong-client-id',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid secret');
  });

  test('Token for client credentials authentication header success', async () => {
    const res = await request(app)
      .post('/oauth2/token')
      .type('form')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .send({
        grant_type: 'client_credentials',
      });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.access_token).toBeDefined();
  });

  test('Token for client credentials wrong authentication header', async () => {
    const res = await request(app).post('/oauth2/token').type('form').set('Authorization', 'Bearer xyz').send({
      grant_type: 'client_credentials',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid authorization header');
  });

  test('Token for client empty secret', async () => {
    // Create a client without an secret
    const badClient = await systemRepo.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      name: 'Bad Client',
      description: 'Bad Client',
      secret: '',
      redirectUri: 'https://example.com',
    });

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: badClient.id,
      client_secret: 'wrong-client-secret',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token for client without project membership', async () => {
    const client = await systemRepo.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      name: 'Client without project membership',
      secret: generateSecret(32),
    });

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token for authorization_code with missing code', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: '',
      code_verifier: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing code');
  });

  test('Token for authorization_code with bad code', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: 'xyzxyz',
      code_verifier: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid code');
  });

  test('Token for authorization_code with invalid client ID', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      client_id: 'INVALID',
      code: '',
      code_verifier: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Missing code');
  });

  test('Token for authorization_code with invalid authorization header', async () => {
    const res = await request(app).post('/oauth2/token').set('Authorization', 'Bearer xyz').type('form').send({
      grant_type: 'authorization_code',
      code: '',
      code_verifier: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid authorization header');
  });

  test('Authorization code missing verification', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('invalid_request');
    expect(res2.body.error_description).toBe('Missing verification context');
  });

  test('Authorization code missing code_verifier', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('invalid_request');
    expect(res2.body.error_description).toBe('Missing code verifier');
  });

  test('Authorization code token with code verifier success', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeUndefined();
  });

  test('Authorization code token with code challenge and PKCE optional', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        clientId: pkceOptionalClient.id as string,
        email,
        password,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: pkceOptionalClient.id as string,
        code: res.body.code,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeUndefined();
  });

  test('Authorization code token with wrong client secret', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      client_id: client.id,
      client_secret: 'wrong',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('invalid_request');
    expect(res2.body.error_description).toBe('Invalid secret');
  });

  test('Authorization code token with client secret success', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      email,
      password,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeUndefined();
  });

  test('Authorization code revoked', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    // Find the login
    const loginBundle = await systemRepo.search<Login>(parseSearchDefinition('Login?code=' + res.body.code));
    expect(loginBundle.entry).toHaveLength(1);

    // Revoke the login
    const login = loginBundle.entry?.[0]?.resource as Login;
    await systemRepo.updateResource({
      ...login,
      revoked: true,
    });

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('invalid_grant');
    expect(res2.body.error_description).toBe('Token revoked');
  });

  test('Authorization code token success with refresh', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      remember: true,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();
  });

  test('Authorization code token success with client ID', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: client.id as string,
        code: res.body.code,
        code_verifier: 'xyz',
      });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
  });

  test('Authorization code token failure with client ID', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      client_id: 'wrong-client-id',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('invalid_request');
    expect(res2.body.error_description).toBe('Invalid client');
  });

  test('Authorization code token failure already granted', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_grant');
    expect(res3.body.error_description).toBe('Token already granted');
  });

  test('Refresh token without token', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid refresh token');
  });

  test('Refresh token with malformed token', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid refresh token');
  });

  test('Refresh token success', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      remember: true,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3.status).toBe(200);
    expect(res3.body.token_type).toBe('Bearer');
    expect(res3.body.scope).toBe('openid');
    expect(res3.body.expires_in).toBe(3600);
    expect(res3.body.id_token).toBeDefined();
    expect(res3.body.access_token).toBeDefined();
    expect(res3.body.refresh_token).toBeDefined();
  });

  test('Refresh token failed for no refresh secret', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      remember: false,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeUndefined();

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3.status).toBe(400);
    expect(res3.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid refresh token',
    });
  });

  test('Refresh token failure with S256 code', async () => {
    const code = randomUUID();
    const codeHash = hashCode(code);

    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: codeHash,
        codeChallengeMethod: 'S256',
        remember: true,
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: codeHash, // sending hash, should be code
    });
    expect(res2.status).toBe(400);
  });

  test('Refresh token success with S256 code', async () => {
    const code = randomUUID();
    const codeHash = hashCode(code);

    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: codeHash,
        codeChallengeMethod: 'S256',
        remember: true,
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: code,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3.status).toBe(200);
    expect(res3.body.token_type).toBe('Bearer');
    expect(res3.body.scope).toBe('openid');
    expect(res3.body.expires_in).toBe(3600);
    expect(res3.body.id_token).toBeDefined();
    expect(res3.body.access_token).toBeDefined();
    expect(res3.body.refresh_token).toBeDefined();
  });

  test('Refresh token revoked', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      remember: true,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    // Find the login
    const loginBundle = await systemRepo.search<Login>(parseSearchDefinition('Login?code=' + res.body.code));
    expect(loginBundle.entry).toHaveLength(1);

    // Revoke the login
    const login = loginBundle.entry?.[0]?.resource as Login;
    await systemRepo.updateResource({
      ...login,
      revoked: true,
    });

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_grant');
    expect(res3.body.error_description).toBe('Token revoked');
  });

  test('Refresh token Basic auth success', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        remember: true,
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(200);
    expect(res3.body.token_type).toBe('Bearer');
    expect(res3.body.scope).toBe('openid');
    expect(res3.body.expires_in).toBe(3600);
    expect(res3.body.id_token).toBeDefined();
    expect(res3.body.access_token).toBeDefined();
    expect(res3.body.refresh_token).toBeDefined();
  });

  test('Refresh token Basic auth failure wrong auth type', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        remember: true,
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Bearer ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_request');
    expect(res3.body.error_description).toBe('Invalid authorization header');
  });

  test('Refresh token Basic auth failure wrong client ID', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        remember: true,
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Basic ' + Buffer.from('wrong-id' + ':' + client.secret).toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_grant');
    expect(res3.body.error_description).toBe('Incorrect client');
  });

  test('Refresh token Basic auth failure wrong secret', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        remember: true,
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':').toString('base64'))
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: res2.body.refresh_token,
      });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('invalid_grant');
    expect(res3.body.error_description).toBe('Incorrect client secret');
  });

  test('Refresh token rotation', async () => {
    // 1) Authorize
    // 2) Get tokens with grant_type=authorization_code
    // 3) Get tokens with grant_type=refresh_token
    // 4) Get tokens again with grant_type=refresh_token
    // 5) Verify that the first refresh token is invalid

    // 1) Authorize
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email,
        password,
        clientId: client.id as string,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        remember: true,
      });
    expect(res.status).toBe(200);

    // 2) Get tokens with grant_type=authorization_code
    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    // 3) Get tokens with grant_type=refresh_token
    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res3.status).toBe(200);
    expect(res3.body.token_type).toBe('Bearer');
    expect(res3.body.scope).toBe('openid');
    expect(res3.body.expires_in).toBe(3600);
    expect(res3.body.id_token).toBeDefined();
    expect(res3.body.access_token).toBeDefined();
    expect(res3.body.refresh_token).toBeDefined();

    // 4) Get tokens again with grant_type=refresh_token
    const res4 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res3.body.refresh_token,
    });
    expect(res4.status).toBe(200);
    expect(res4.body.token_type).toBe('Bearer');
    expect(res4.body.scope).toBe('openid');
    expect(res4.body.expires_in).toBe(3600);
    expect(res4.body.id_token).toBeDefined();
    expect(res4.body.access_token).toBeDefined();
    expect(res4.body.refresh_token).toBeDefined();

    // 5) Verify that the first refresh token is invalid
    const res5 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: res2.body.refresh_token,
    });
    expect(res5.status).toBe(400);
    expect(res5.body).toMatchObject({ error: 'invalid_request', error_description: 'Invalid token' });
  });

  test('Patient in token response', async () => {
    const patientEmail = `test-patient-${randomUUID()}@example.com`;
    const patientPassword = 'test-patient-password';

    // Invite a test patient
    const testPatient = await inviteUser({
      project,
      resourceType: 'Patient',
      firstName: 'Test',
      lastName: 'Patient',
      email: patientEmail,
    });
    expect(testPatient.user).toBeDefined();
    expect(testPatient.profile).toBeDefined();

    // Force set the password
    await setPassword(testPatient.user, patientPassword);

    // Authenticate
    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        email: patientEmail,
        password: patientPassword,
        clientId: client.id as string,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        remember: true,
      });
    expect(res.status).toBe(200);

    // Get tokens
    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid');
    expect(res2.body.patient).toEqual(testPatient.profile.id);
  });

  test('Client assertion success', async () => {
    // Create a new client
    const client2 = await createClient(systemRepo, { project, name: 'Test Client 2' });

    // Set the client jwksUri
    await systemRepo.updateResource<ClientApplication>({ ...client2, jwksUri: 'https://example.com/jwks.json' });

    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ 'urn:example:claim': true })
      .setProtectedHeader({ alg: 'ES384' })
      .setIssuedAt()
      .setIssuer(client2.id as string)
      .setSubject(client2.id as string)
      .setAudience('http://localhost:8103/oauth2/token')
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    expect(jwt).toBeDefined();

    // Then use the JWT for a client credentials grant
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: jwt,
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.access_token).toBeDefined();
  });

  test('Client assertion client not found', async () => {
    const fakeClientId = randomUUID();

    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ 'urn:example:claim': true })
      .setProtectedHeader({ alg: 'ES384' })
      .setIssuedAt()
      .setIssuer(fakeClientId)
      .setSubject(fakeClientId)
      .setAudience('http://localhost:8103/oauth2/token')
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    expect(jwt).toBeDefined();

    // Then use the JWT for a client credentials grant
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Client not found',
    });
  });

  test('Client assertion missing jwks URL', async () => {
    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ 'urn:example:claim': true })
      .setProtectedHeader({ alg: 'ES384' })
      .setIssuedAt()
      .setIssuer(client.id as string)
      .setSubject(client.id as string)
      .setAudience('http://localhost:8103/oauth2/token')
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    expect(jwt).toBeDefined();

    // Then use the JWT for a client credentials grant
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Client must have a JWK Set URL',
    });
  });

  test('Client assertion invalid audience', async () => {
    // Create a new client
    const client2 = await createClient(systemRepo, { project, name: 'Test Client 2' });

    // Set the client jwksUri
    await systemRepo.updateResource<ClientApplication>({ ...client2, jwksUri: 'https://example.com/jwks.json' });

    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ 'urn:example:claim': true })
      .setProtectedHeader({ alg: 'ES384' })
      .setIssuedAt()
      .setIssuer(client2.id as string)
      .setSubject(client2.id as string)
      .setAudience('https://invalid-audience.com')
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    expect(jwt).toBeDefined();

    // Then use the JWT for a client credentials grant
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion audience',
    });
  });

  test('Client assertion invalid issuer', async () => {
    // Create a new client
    const client2 = await createClient(systemRepo, { project, name: 'Test Client 2' });

    // Set the client jwksUri
    await systemRepo.updateResource<ClientApplication>({ ...client2, jwksUri: 'https://example.com/jwks.json' });

    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ 'urn:example:claim': true })
      .setProtectedHeader({ alg: 'ES384' })
      .setIssuedAt()
      .setIssuer('invalid-issuer')
      .setSubject(client2.id as string)
      .setAudience('http://localhost:8103/oauth2/token')
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    expect(jwt).toBeDefined();

    // Then use the JWT for a client credentials grant
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion issuer',
    });
  });

  test('Client assertion invalid signature', async () => {
    // Create a new client
    const client2 = await createClient(systemRepo, { project, name: 'Test Client 2' });

    // Set the client jwksUri
    await systemRepo.updateResource<ClientApplication>({ ...client2, jwksUri: 'https://example.com/jwks.json' });

    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ invalid: true })
      .setProtectedHeader({ alg: 'ES384' })
      .setIssuedAt()
      .setIssuer(client2.id as string)
      .setSubject(client2.id as string)
      .setAudience('http://localhost:8103/oauth2/token')
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    expect(jwt).toBeDefined();

    // Then use the JWT for a client credentials grant
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion signature',
    });
  });

  test('Smart App Launch tokens', async () => {
    // Create a SmartAppLaunch
    const launch = await systemRepo.createResource<SmartAppLaunch>({
      resourceType: 'SmartAppLaunch',
      patient: { reference: `Patient/${randomUUID()}` },
      encounter: { reference: `Patient/${randomUUID()}` },
    });

    const res = await request(app).post('/auth/login').type('json').send({
      clientId: client.id,
      launch: launch.id,
      email,
      password,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.patient).toBeDefined();
    expect(res2.body.encounter).toBeDefined();
  });

  test('IP address allow', async () => {
    const res = await request(app).post('/auth/login').set('X-Forwarded-For', '5.5.5.5').type('json').send({
      clientId: client.id,
      email,
      password,
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res2.status).toBe(200);
  });

  test('IP address block', async () => {
    const res = await request(app).post('/auth/login').set('X-Forwarded-For', '6.6.6.6').type('json').send({
      clientId: client.id,
      email,
      password,
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('IP address not allowed');
  });
});
