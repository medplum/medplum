import {
  ContentType,
  createReference,
  OAuthClientAssertionType,
  OAuthGrantType,
  OAuthTokenType,
  parseJWTPayload,
  parseSearchRequest,
} from '@medplum/core';
import { AccessPolicy, ClientApplication, Login, Project, SmartAppLaunch } from '@medplum/fhirtypes';
import express from 'express';
import { generateKeyPair, jwtVerify, SignJWT } from 'jose';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { setPassword } from '../auth/setpassword';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { generateSecret, verifyJwt } from './keys';
import { hashCode } from './token';

jest.mock('jose', () => {
  const core = jest.requireActual('@medplum/core');
  const original = jest.requireActual('jose');
  let count = 0;
  return {
    ...original,
    jwtVerify: jest.fn((credential: string) => {
      const payload = core.parseJWTPayload(credential);
      if (payload.invalid) {
        throw new Error('Verification failed');
      }
      if (payload.multipleMatching) {
        count = payload.successVerified ? count + 1 : 0;
        let error: MockJoseMultipleMatchingError;
        if (count <= 1) {
          error = new MockJoseMultipleMatchingError(
            'multiple matching keys found in the JSON Web Key Set',
            'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
          );
        } else if (count === 2) {
          error = new MockJoseMultipleMatchingError('Verification fail', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED');
        } else {
          return { payload };
        }
        throw error;
      }
      return { payload };
    }),
  };
});

jest.mock('node-fetch');

describe('OAuth2 Token', () => {
  const app = express();
  const systemRepo = getSystemRepo();
  const domain = randomUUID() + '.example.com';
  const email = `text@${domain}`;
  const password = randomUUID();
  const redirectUri = `https://${domain}/auth/callback`;
  let config: MedplumServerConfig;
  let project: Project;
  let client: ClientApplication;
  let pkceOptionalClient: ClientApplication;
  let externalAuthClient: ClientApplication;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);

    // Create a test project
    ({ project, client } = await createTestProject({ withClient: true }));

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

    // Create a new client application with external auth
    externalAuthClient = await createClient(systemRepo, {
      project,
      name: 'External Auth Client',
      redirectUri,
      identityProvider: {
        authorizeUrl: 'https://example.com/oauth2/authorize',
        tokenUrl: 'https://example.com/oauth2/token',
        userInfoUrl: 'https://example.com/oauth2/userinfo',
        clientId: '123',
        clientSecret: '456',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    const badClient = await withTestContext(() =>
      systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        name: 'Bad Client',
        description: 'Bad Client',
        secret: '',
        redirectUri: 'https://example.com',
      })
    );

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
    const client = await withTestContext(() =>
      systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        name: 'Client without project membership',
        secret: generateSecret(32),
      })
    );

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token for client in "off" status', async () => {
    const { client } = await createTestProject({ withClient: true });
    await withTestContext(() => systemRepo.updateResource<ClientApplication>({ ...client, status: 'off' }));

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token for client in "active" status', async () => {
    const { client } = await createTestProject({ withClient: true });
    await withTestContext(() => systemRepo.updateResource<ClientApplication>({ ...client, status: 'active' }));

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.access_token).toBeDefined();
  });

  test('Client credentials IP address restriction', async () => {
    const { client } = await createTestProject({
      withClient: true,
      withAccessToken: true,
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: '*' }],
        ipAccessRule: [
          { name: 'Block test', value: '6.6.6.6', action: 'block' },
          { name: 'Allow by default', value: '*', action: 'allow' },
        ],
      },
    });

    // Login with client credentials from 6.6.6.6
    // Should fail because of IP address block
    const res1 = await request(app).post('/oauth2/token').set('X-Forwarded-For', '6.6.6.6').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toBe('invalid_request');
    expect(res1.body.error_description).toBe('IP address not allowed');

    // Login with client credentials from 5.5.5.5
    // Should succeed
    const res2 = await request(app).post('/oauth2/token').set('X-Forwarded-For', '5.5.5.5').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.error).toBeUndefined();
    expect(res2.body.access_token).toBeDefined();
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
      scope: 'openid profile email',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid profile email');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeUndefined();

    const idToken = parseJWTPayload(res2.body.id_token);
    expect(idToken.email).toBe(email);
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

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
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
    const loginBundle = await systemRepo.search<Login>(parseSearchRequest('Login?code=' + res.body.code));
    expect(loginBundle.entry).toHaveLength(1);

    // Revoke the login
    const login = loginBundle.entry?.[0]?.resource as Login;
    await withTestContext(() =>
      systemRepo.updateResource({
        ...login,
        revoked: true,
      })
    );

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('invalid_grant');
    expect(res2.body.error_description).toBe('Token revoked');
  });

  test('Authorization code token success with refresh using legacy remember flag', async () => {
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

  test('Authorization code token success with refresh using scope=offline', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      scope: 'openid offline',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();
  });

  test('Authorization code token success with refresh using scope=offline_access', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      scope: 'openid offline_access',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline_access');
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
      scope: 'openid offline',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
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
    expect(res3.body.scope).toBe('openid offline');
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
        scope: 'openid offline',
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
        scope: 'openid offline',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: code,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
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
    expect(res3.body.scope).toBe('openid offline');
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
      scope: 'openid offline',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    // Find the login
    const loginBundle = await systemRepo.search<Login>(parseSearchRequest('Login?code=' + res.body.code));
    expect(loginBundle.entry).toHaveLength(1);

    // Revoke the login
    const login = loginBundle.entry?.[0]?.resource as Login;
    await withTestContext(() =>
      systemRepo.updateResource({
        ...login,
        revoked: true,
      })
    );

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
        scope: 'openid offline',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
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
    expect(res3.body.scope).toBe('openid offline');
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
        scope: 'openid offline',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
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
        scope: 'openid offline',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const res3 = await request(app)
      .post('/oauth2/token')
      .set('Authorization', 'Basic ' + Buffer.from('wrong-id:' + client.secret).toString('base64'))
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
        scope: 'openid offline',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
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
        scope: 'openid offline',
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
    expect(res2.body.scope).toBe('openid offline');
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
    expect(res3.body.scope).toBe('openid offline');
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
    expect(res4.body.scope).toBe('openid offline');
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

  test('refreshTokenLifetime -- Valid duration', async () => {
    // Create a new client application with external auth
    const validLifetimeClient = await createClient(systemRepo, {
      project,
      name: 'refreshTokenLifetime - Valid Client',
      refreshTokenLifetime: '60s',
    });

    expect(validLifetimeClient?.id).toBeDefined();
    expect(validLifetimeClient?.secret).toBeDefined();

    const res = await request(app)
      .post('/auth/login')
      .type('json')
      .send({
        clientId: validLifetimeClient.id as string,
        email,
        password,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
        scope: 'openid offline',
      });
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .post('/oauth2/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: validLifetimeClient.id as string,
        code: res.body.code,
        code_verifier: 'xyz',
        scope: 'openid offline',
      });

    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeDefined();

    const claims = (await verifyJwt(res2.body.refresh_token)).payload;
    expect(claims.exp).toEqual((claims.iat as number) + 60);
  });

  test('refreshTokenLifetime -- Invalid duration', async () => {
    // Create a new client application with external auth
    await expect(
      createClient(systemRepo, {
        project,
        name: 'refreshTokenLifetime - Invalid Client',
        refreshTokenLifetime: 'medplum',
      })
    ).rejects.toThrow(
      /Constraint clapp-1 not met: Token lifetime must be a valid string representing time duration (eg. 2w, 1h)*/
    );

    await expect(
      createClient(systemRepo, {
        project,
        name: 'refreshTokenLifetime - Invalid Client',
        refreshTokenLifetime: '300',
      })
    ).rejects.toThrow(
      /Constraint clapp-1 not met: Token lifetime must be a valid string representing time duration (eg. 2w, 1h)*/
    );
  });

  test('Patient in token response', async () => {
    const patientEmail = `test-patient-${randomUUID()}@example.com`;
    const patientPassword = 'test-patient-password';

    // Invite a test patient
    const testPatient = await withTestContext(async () => {
      const patient = await inviteUser({
        project,
        resourceType: 'Patient',
        firstName: 'Test',
        lastName: 'Patient',
        email: patientEmail,
      });
      expect(patient.user).toBeDefined();
      expect(patient.profile).toBeDefined();

      // Force set the password
      await setPassword(patient.user, patientPassword);
      return patient;
    });

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
        scope: 'openid offline',
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
    expect(res2.body.scope).toBe('openid offline');
    expect(res2.body.patient).toEqual(testPatient.profile.id);
  });

  test('Client assertion success', async () => {
    const client2 = await withTestContext(async () => {
      // Create a new client
      const client = await createClient(systemRepo, { project, name: 'Test Client 2' });
      // Set the client jwksUri
      await systemRepo.updateResource<ClientApplication>({ ...client, jwksUri: 'https://example.com/jwks.json' });
      return client;
    });

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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Client must have a JWK Set URL',
    });
  });

  test('Client assertion invalid audience', async () => {
    const client2 = await withTestContext(async () => {
      // Create a new client
      const client = await createClient(systemRepo, { project, name: 'Test Client 2' });
      // Set the client jwksUri
      await systemRepo.updateResource<ClientApplication>({ ...client, jwksUri: 'https://example.com/jwks.json' });
      return client;
    });

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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion audience',
    });
  });

  test('Client assertion invalid issuer', async () => {
    const client2 = await withTestContext(async () => {
      // Create a new client
      const client = await createClient(systemRepo, { project, name: 'Test Client 2' });
      // Set the client jwksUri
      await systemRepo.updateResource<ClientApplication>({ ...client, jwksUri: 'https://example.com/jwks.json' });
      return client;
    });

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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion issuer',
    });
  });

  test('Client assertion invalid signature', async () => {
    const client2 = await withTestContext(async () => {
      // Create a new client
      const client = await createClient(systemRepo, { project, name: 'Test Client 2' });
      // Set the client jwksUri
      await systemRepo.updateResource<ClientApplication>({ ...client, jwksUri: 'https://example.com/jwks.json' });
      return client;
    });

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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion signature',
    });
  });

  test('Client assertion multiple matching 3rd check success', async () => {
    const client2 = await withTestContext(async () => {
      // Create a new client
      const client = await createClient(systemRepo, { project, name: 'Test Client 2' });
      // Set the client jwksUri
      await systemRepo.updateResource<ClientApplication>({ ...client, jwksUri: 'https://example.com/jwks.json' });
      return client;
    });

    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ multipleMatching: true, successVerified: true })
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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: jwt,
    });
    expect(res.status).toBe(200);
    expect(jwtVerify).toHaveBeenCalledTimes(3);
  });

  test('Client assertion multiple inner error', async () => {
    const client2 = await withTestContext(async () => {
      // Create a new client
      const client = await createClient(systemRepo, { project, name: 'Test Client 2' });
      // Set the client jwksUri
      await systemRepo.updateResource<ClientApplication>({ ...client, jwksUri: 'https://example.com/jwks.json' });
      return client;
    });

    // Create the JWT
    const keyPair = await generateKeyPair('ES384');
    const jwt = await new SignJWT({ multipleMatching: true })
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
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(jwtVerify).toHaveBeenCalledTimes(2);
  });

  test('Client assertion invalid assertion type', async () => {
    const client2 = await withTestContext(async () => {
      // Create a new client
      const client = await createClient(systemRepo, { project, name: 'Test Client 2' });
      // Set the client jwksUri
      await systemRepo.updateResource<ClientApplication>({ ...client, jwksUri: 'https://example.com/jwks.json' });
      return client;
    });

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
      client_assertion_type: 'urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer',
      client_assertion: jwt,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Unsupported client assertion type',
    });
  });

  test('Client assertion missing JWT', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.ClientCredentials,
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: '', // empty JWT
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion',
    });
  });

  test('Client assertion invalid JWT', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.ClientCredentials,
      client_assertion_type: OAuthClientAssertionType.JwtBearer,
      client_assertion: 'foo', // not a valid JWT
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid client assertion',
    });
  });

  test('Smart App Launch tokens', async () => {
    // Create a SmartAppLaunch
    const launch = await withTestContext(() =>
      systemRepo.createResource<SmartAppLaunch>({
        resourceType: 'SmartAppLaunch',
        patient: { reference: `Patient/${randomUUID()}` },
        encounter: { reference: `Patient/${randomUUID()}` },
      })
    );

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

  test('Token exchange success', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => ({ email }),
      headers: { get: () => ContentType.JSON },
    }));

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: externalAuthClient.id,
      subject_token: 'xyz',
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
  });

  test('Token exchange non-JSON response', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      json: () => {
        throw new Error('Invalid JSON');
      },
      text: () => 'Unexpected error',
      headers: { get: () => ContentType.TEXT },
    }));

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: externalAuthClient.id,
      subject_token: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Failed to verify code - check your identity provider configuration');
  });

  test('Too many requests', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 429,
      headers: { get: () => ContentType.JSON },
    }));

    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: externalAuthClient.id,
      subject_token: 'xyz',
    });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Too Many Requests');
  });

  test('Token exchange missing client ID', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: '',
      subject_token: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token exchange missing client identity provider', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: client.id,
      subject_token: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Token exchange missing subject token', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.AccessToken,
      client_id: externalAuthClient.id,
      subject_token: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid subject_token');
  });

  test('Token exchange unknown subject token type', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: OAuthGrantType.TokenExchange,
      subject_token_type: OAuthTokenType.Saml1Token,
      client_id: externalAuthClient.id,
      subject_token: 'xyz',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid subject_token_type');
  });

  test('FHIRcast scopes added to client credentials flow', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
      scope: 'openid fhircast/Patient-open.read',
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.access_token).toBeDefined();
    expect(res.body['hub.topic']).toBeDefined();
    expect(res.body['hub.url']).toBeDefined();
  });

  test('FHIRcast scopes NOT added - should not have Hub topic or URL', async () => {
    const res = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.access_token).toBeDefined();
    expect(res.body['hub.topic']).not.toBeDefined();
    expect(res.body['hub.url']).not.toBeDefined();
  });

  test('Refresh tokens disabled for super admins', async () => {
    // Create a super admin project
    const { project } = await createTestProject({ project: { superAdmin: true } });

    // Create a test user
    const email = `test-${randomUUID()}@example.com`;
    const password = 'test-password';
    await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'Test',
      email,
      password,
    });

    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
      scope: 'openid offline', // Request offline access
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.token_type).toBe('Bearer');
    expect(res2.body.scope).toBe('openid offline');
    expect(res2.body.expires_in).toBe(3600);
    expect(res2.body.id_token).toBeDefined();
    expect(res2.body.access_token).toBeDefined();
    expect(res2.body.refresh_token).toBeUndefined();
  });
});

class MockJoseMultipleMatchingError extends Error {
  code: string;
  [Symbol.asyncIterator]!: () => AsyncIterableIterator<any>;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'CustomError';
    this.code = code;
    this[Symbol.asyncIterator] = async function* () {
      yield 'key1';
      yield 'key2';
    };
  }
}
