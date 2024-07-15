import { OperationOutcomeError } from '@medplum/core';
import { ClientApplication, Login } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { createTestClient, withTestContext } from '../test.setup';
import {
  getAuthTokens,
  getClientApplication,
  getMembershipsForLogin,
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
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Not found');
    }
  });

  test('Login with missing email', async () => {
    try {
      await tryLogin({
        clientId: client.id as string,
        authMethod: 'password',
        email: '',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid email');
    }
  });

  test('Login with missing password', async () => {
    try {
      await tryLogin({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: '',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid password');
    }
  });

  test('User not found', async () => {
    try {
      await tryLogin({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'user-not-found@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('User not found');
    }
  });

  test('Blank authentication method', async () => {
    try {
      await tryLogin({
        clientId: client.id as string,
        authMethod: '' as unknown as 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid authentication method');
    }
  });

  test('Invalid authentication method', async () => {
    try {
      await tryLogin({
        clientId: client.id as string,
        authMethod: 'xyz' as unknown as 'password',
        email: 'admin@example.com',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid authentication method');
    }
  });

  test('Invalid google credentials', async () => {
    try {
      await tryLogin({
        clientId: client.id as string,
        authMethod: 'google',
        email: 'admin@example.com',
        scope: 'openid',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid google credentials');
    }
  });

  test('Invalid scope', async () => {
    try {
      await tryLogin({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: '',
        nonce: 'nonce',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
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
      expect(outcome.issue?.[0]?.severity).toEqual('error');
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
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('User not found');
    }
  });

  test('Login successfully', async () => {
    const login = await withTestContext(() =>
      tryLogin({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
      })
    );
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
      expect(outcome.issue?.[0]?.details?.text).toEqual('Missing email or externalId');
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
      expect(outcome.issue?.[0]?.details?.text).toEqual('Project ID is required for external ID');
    }
  });

  test('Missing codeChallengeMethod', () => {
    // If user submits codeChallenge, then codeChallengeMethod is required
    try {
      validatePkce(
        {
          clientId: client.id as string,
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
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code_challenge_method');
    }
  });

  test('Missing codeChallenge', () => {
    // If user submits codeChallengeMethod, then codeChallenge is required
    try {
      validatePkce(
        {
          clientId: client.id as string,
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
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code_challenge');
    }
  });

  test('Invalid codeChallengeMethod', () => {
    try {
      validatePkce(
        {
          clientId: client.id as string,
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
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code_challenge_method');
    }
  });

  test('Plain text code challenge method', () => {
    expect(() =>
      validatePkce(
        {
          clientId: client.id as string,
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
          clientId: client.id as string,
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
          clientId: client.id as string,
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
      expect(outcome.issue?.[0]?.details?.text).toEqual('Login revoked');
    }
  });

  test('verifyMfaToken login granted', async () => {
    try {
      await verifyMfaToken({ resourceType: 'Login', granted: true } as Login, 'token');
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toEqual('Login granted');
    }
  });

  test('verifyMfaToken login already verified', async () => {
    try {
      await verifyMfaToken({ resourceType: 'Login', mfaVerified: true } as Login, 'token');
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toEqual('Login already verified');
    }
  });

  test('getMembershipsForLogin missing user reference', async () => {
    try {
      await getMembershipsForLogin({ resourceType: 'Login', user: {} } as Login);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toEqual('User reference is missing');
    }
  });

  test('getAuthTokens Login missing profile', async () => {
    try {
      await getAuthTokens(
        { resourceType: 'User', id: '123', firstName: 'John', lastName: 'Doe' },
        { resourceType: 'Login', user: { reference: 'User/123' } } as Login,
        {
          reference: 'Patient/123',
        }
      );
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.details?.text).toEqual('Login missing profile');
    }
  });

  test('CLI client', async () => {
    const client = await getClientApplication('medplum-cli');
    expect(client).toBeDefined();
    expect(client.id).toEqual('medplum-cli');
  });
});

function fail(message: string): never {
  throw new Error(message);
}
