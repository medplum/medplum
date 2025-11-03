// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcomeError, WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { ClientApplication, Login, Patient, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { Repository, SystemRepository } from '../fhir/repo';
import { getShardSystemRepo } from '../fhir/repo';
import { createTestClient, createTestProject, withTestContext } from '../test.setup';
import { verifyJwt } from './keys';
import {
  getAuthTokens,
  getClientApplication,
  getMembershipsForLogin,
  normalizeUserInfoUrl,
  tryLogin,
  validateLoginRequest,
  validatePkce,
  verifyMfaToken,
} from './utils';

let client: ClientApplication;

describe('OAuth utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Login with invalid client ID', async () => {
    try {
      await tryLogin({
        clientId: randomUUID(),
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Not found');
    }
  });

  test('Login with missing email', async () => {
    try {
      await tryLogin({
        clientId: client.id,
        authMethod: 'password',
        email: '',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Invalid email');
    }
  });

  test('Login with missing password', async () => {
    try {
      await tryLogin({
        clientId: client.id,
        authMethod: 'password',
        email: 'admin@example.com',
        password: '',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Invalid password');
    }
  });

  test('User not found', async () => {
    try {
      await tryLogin({
        clientId: client.id,
        authMethod: 'password',
        email: 'user-not-found@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('User not found');
    }
  });

  test('Blank authentication method', async () => {
    try {
      await tryLogin({
        clientId: client.id,
        authMethod: '' as unknown as 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid authentication method');
    }
  });

  test('Invalid authentication method', async () => {
    try {
      await tryLogin({
        clientId: client.id,
        authMethod: 'xyz' as unknown as 'password',
        email: 'admin@example.com',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid authentication method');
    }
  });

  test('Invalid google credentials', async () => {
    try {
      await tryLogin({
        clientId: client.id,
        authMethod: 'google',
        email: 'admin@example.com',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid google credentials');
    }
  });

  test('Invalid scope', async () => {
    try {
      await tryLogin({
        clientId: client.id,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: '',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid scope');
    }
  });

  test('Login with externalId and missing projectId', async () => {
    try {
      await tryLogin({
        authMethod: 'external',
        externalId: 'external',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Project ID is required for external ID');
    }
  });

  test('Login with externalId not found', async () => {
    try {
      await tryLogin({
        authMethod: 'external',
        projectId: randomUUID(),
        externalId: randomUUID(),
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toStrictEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('User not found');
    }
  });

  test('Login successfully', async () => {
    const login = await tryLogin({
      clientId: client.id,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
      nonce: 'nonce',
    });
    expect(login).toBeDefined();
  });

  test('External auth without email or externalId', () => {
    try {
      validateLoginRequest({
        authMethod: 'external',
        scope: 'openid',
        nonce: 'nonce',
        projectId: randomUUID(),
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Missing email or externalId');
    }
  });

  test('External auth without projectId', () => {
    try {
      validateLoginRequest({
        authMethod: 'external',
        externalId: randomUUID(),
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Project ID is required for external ID');
    }
  });

  test('Missing codeChallengeMethod', () => {
    // If user submits codeChallenge, then codeChallengeMethod is required
    try {
      validatePkce(
        {
          clientId: client.id,
          authMethod: 'password',
          email: 'admin@example.com',
          password: 'medplum_admin',
          scope: 'openid',
          nonce: 'nonce',
          codeChallenge: 'xyz',
        },
        undefined
      );
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.expression?.[0]).toStrictEqual('code_challenge_method');
    }
  });

  test('Missing codeChallenge', () => {
    // If user submits codeChallengeMethod, then codeChallenge is required
    try {
      validatePkce(
        {
          clientId: client.id,
          authMethod: 'password',
          email: 'admin@example.com',
          password: 'medplum_admin',
          scope: 'openid',
          nonce: 'nonce',
          codeChallengeMethod: 'plain',
        },
        client
      );
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.expression?.[0]).toStrictEqual('code_challenge');
    }
  });

  test('Invalid codeChallengeMethod', () => {
    try {
      validatePkce(
        {
          clientId: client.id,
          authMethod: 'password',
          email: 'admin@example.com',
          password: 'medplum_admin',
          scope: 'openid',
          nonce: 'nonce',
          codeChallenge: 'xyz',
          // @ts-expect-error Invalid `codeChallengeMethod` value, must be `S256` or `plain`
          codeChallengeMethod: 'xyz',
        },
        client
      );
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.expression?.[0]).toStrictEqual('code_challenge_method');
    }
  });

  test('Plain text code challenge method', () => {
    expect(() =>
      validatePkce(
        {
          clientId: client.id,
          authMethod: 'password',
          email: 'admin@example.com',
          password: 'medplum_admin',
          scope: 'openid',
          nonce: 'nonce',
          codeChallenge: 'xyz',
          codeChallengeMethod: 'plain',
        },
        client
      )
    ).not.toThrow();
  });

  test('S256 code challenge method', () => {
    expect(() =>
      validatePkce(
        {
          clientId: client.id,
          authMethod: 'password',
          email: 'admin@example.com',
          password: 'medplum_admin',
          scope: 'openid',
          nonce: 'nonce',
          codeChallenge: 'xyz',
          codeChallengeMethod: 'S256',
        },
        client
      )
    ).not.toThrow();
  });

  test('Client application PKCE optional', () => {
    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      id: randomUUID(),
      pkceOptional: true,
    };

    expect(() =>
      validatePkce(
        {
          clientId: client.id,
          authMethod: 'password',
          email: 'admin@example.com',
          password: 'medplum_admin',
          scope: 'openid',
          nonce: 'nonce',
        },
        client
      )
    ).not.toThrow();
  });

  test('verifyMfaToken login revoked', async () => {
    try {
      await verifyMfaToken({ resourceType: 'Login', revoked: true } as Login, 'token');
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Login revoked');
    }
  });

  test('verifyMfaToken login granted', async () => {
    try {
      await verifyMfaToken({ resourceType: 'Login', granted: true } as Login, 'token');
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Login granted');
    }
  });

  test('verifyMfaToken login already verified', async () => {
    try {
      await verifyMfaToken({ resourceType: 'Login', mfaVerified: true } as Login, 'token');
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Login already verified');
    }
  });

  test('getMembershipsForLogin missing user reference', async () => {
    try {
      await getMembershipsForLogin({ resourceType: 'Login', user: {} } as Login);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('User reference is missing');
    }
  });

  test('getAuthTokens Login missing profile', async () => {
    try {
      await getAuthTokens(
        { resourceType: 'User', id: '123', firstName: 'John', lastName: 'Doe' },
        { resourceType: 'Login', id: '456', user: { reference: 'User/123' } } as WithId<Login>,
        {
          reference: 'Patient/123',
        }
      );
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toStrictEqual('Login missing profile');
    }
  });

  describe('getAuthTokens with email scope', () => {
    let project: WithId<Project>;
    let repo: Repository;
    let systemRepo: SystemRepository;

    beforeAll(async () => {
      await withTestContext(async () => {
        const result = await createTestProject({ withRepo: true });
        project = result.project;
        repo = result.repo;
        systemRepo = getShardSystemRepo(repo.shardId);
      });
    });

    test('Access token includes email when email scope is requested for User', async () => {
      await withTestContext(async () => {
        // Create a User with email
        const userEmail = `test-${randomUUID()}@example.com`;
        const user = await repo.createResource<User>({
          resourceType: 'User',
          email: userEmail,
          firstName: 'Test',
          lastName: 'User',
        });

        // Create a Patient profile
        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
        });

        // Create a ProjectMembership for the user
        const membership = await systemRepo.createResource<ProjectMembership>({
          resourceType: 'ProjectMembership',
          user: createReference(user),
          profile: createReference(patient),
          project: createReference(project),
        });

        // Create a Login with email scope
        const login = await systemRepo.createResource<Login>({
          resourceType: 'Login',
          authMethod: 'password',
          user: createReference(user),
          membership: createReference(membership),
          scope: 'openid profile email',
          granted: true,
          authTime: new Date().toISOString(),
          nonce: randomUUID(),
        } as Login);

        const tokens = await getAuthTokens(user, login, createReference(patient));

        // Verify access token includes email
        const accessTokenClaims = (await verifyJwt(tokens.accessToken)).payload;
        expect(accessTokenClaims.email).toBe(userEmail);
        expect(accessTokenClaims.login_id).toBe(login.id);
        expect(accessTokenClaims.scope).toBe('openid profile email');

        // Verify ID token also includes email
        const idTokenClaims = (await verifyJwt(tokens.idToken)).payload;
        expect(idTokenClaims.email).toBe(userEmail);
      });
    });

    test('Access token does not include email when email scope is not requested', async () => {
      await withTestContext(async () => {
        // Create a User with email
        const userEmail = `test-${randomUUID()}@example.com`;
        const user = await systemRepo.createResource<User>({
          resourceType: 'User',
          email: userEmail,
          firstName: 'Test',
          lastName: 'User',
        });

        // Create a Patient profile
        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
        });

        // Create a ProjectMembership for the user
        const membership = await systemRepo.createResource<ProjectMembership>({
          resourceType: 'ProjectMembership',
          user: createReference(user),
          profile: createReference(patient),
          project: createReference(project),
        });

        // Create a Login without email scope
        const login = await systemRepo.createResource<Login>({
          resourceType: 'Login',
          authMethod: 'password',
          user: createReference(user),
          membership: createReference(membership),
          scope: 'openid profile',
          granted: true,
          authTime: new Date().toISOString(),
          nonce: randomUUID(),
        } as Login);

        const tokens = await getAuthTokens(user, login, createReference(patient));

        // Verify access token does not include email
        const accessTokenClaims = (await verifyJwt(tokens.accessToken)).payload;
        expect(accessTokenClaims.email).toBeUndefined();
        expect(accessTokenClaims.login_id).toBe(login.id);
        expect(accessTokenClaims.scope).toBe('openid profile');

        // Verify ID token also does not include email
        const idTokenClaims = (await verifyJwt(tokens.idToken)).payload;
        expect(idTokenClaims.email).toBeUndefined();
      });
    });

    test('Access token does not include email for ClientApplication even with email scope', async () => {
      await withTestContext(async () => {
        // Create a ClientApplication
        const client = await repo.createResource<ClientApplication>({
          resourceType: 'ClientApplication',
          name: 'Test Client',
          secret: randomUUID(),
        });

        // Create a Patient profile
        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
        });

        // Create a ProjectMembership for the client
        const membership = await systemRepo.createResource<ProjectMembership>({
          resourceType: 'ProjectMembership',
          user: createReference(client),
          profile: createReference(patient),
          project: createReference(project),
        });

        // Create a Login with email scope
        const login = await systemRepo.createResource<Login>({
          resourceType: 'Login',
          authMethod: 'client',
          user: createReference(client),
          client: createReference(client),
          membership: createReference(membership),
          scope: 'openid profile email',
          granted: true,
          authTime: new Date().toISOString(),
          nonce: randomUUID(),
        } as Login);

        const tokens = await getAuthTokens(client, login, createReference(patient));

        // Verify access token does not include email (ClientApplication is not a User)
        const accessTokenClaims = (await verifyJwt(tokens.accessToken)).payload;
        expect(accessTokenClaims.email).toBeUndefined();
        expect(accessTokenClaims.login_id).toBe(login.id);
        expect(accessTokenClaims.scope).toBe('openid profile email');

        // Verify ID token also does not include email
        const idTokenClaims = (await verifyJwt(tokens.idToken)).payload;
        expect(idTokenClaims.email).toBeUndefined();
      });
    });

    test('Access token does not include email when user has no email address', async () => {
      await withTestContext(async () => {
        // Create a User without email
        const user = await systemRepo.createResource<User>({
          resourceType: 'User',
          firstName: 'Test',
          lastName: 'User',
          // email is undefined
        });

        // Create a Patient profile
        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
        });

        // Create a ProjectMembership for the user
        const membership = await systemRepo.createResource<ProjectMembership>({
          resourceType: 'ProjectMembership',
          user: createReference(user),
          profile: createReference(patient),
          project: createReference(project),
        });

        // Create a Login with email scope
        const login = await systemRepo.createResource<Login>({
          resourceType: 'Login',
          authMethod: 'password',
          user: createReference(user),
          membership: createReference(membership),
          scope: 'openid profile email',
          granted: true,
          authTime: new Date().toISOString(),
          nonce: randomUUID(),
        } as Login);

        const tokens = await getAuthTokens(user, login, createReference(patient));

        // Verify access token does not include email (user has no email)
        const accessTokenClaims = (await verifyJwt(tokens.accessToken)).payload;
        expect(accessTokenClaims.email).toBeUndefined();
        expect(accessTokenClaims.login_id).toBe(login.id);
        expect(accessTokenClaims.scope).toBe('openid profile email');

        // Verify ID token also does not include email
        const idTokenClaims = (await verifyJwt(tokens.idToken)).payload;
        expect(idTokenClaims.email).toBeUndefined();
      });
    });
  });

  test('CLI client', async () => {
    const client = await getClientApplication('medplum-cli');
    expect(client).toBeDefined();
    expect(client.id).toStrictEqual('medplum-cli');
  });

  describe('normalizeUserInfoUrl', () => {
    test.each([
      ['http://example.com/oauth2/userinfo', false],
      [' http://example.com/oauth2/userinfo ', false],
      ['https://example.com/oauth2/userinfo', false],
      [' https://example.com/oauth2/userinfo ', false],
      ['file://example.com/oauth2/userinfo', true],
      [' file://example.com/oauth2/userinfo ', true],
    ])('with URL [%s]', (userInfoUrl, expectError) => {
      try {
        normalizeUserInfoUrl(userInfoUrl);
        if (expectError) {
          fail('Expected error');
        }
      } catch (err) {
        if (!expectError) {
          throw err;
        }
      }
    });
  });
});

function fail(message: string): never {
  throw new Error(message);
}
