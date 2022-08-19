import { ClientApplication, OperationOutcome } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { createTestClient } from '../test.setup';
import { tryLogin, validateLoginRequest } from './utils';

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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Email or password is invalid');
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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
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
        remember: false,
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toBe('Invalid scope');
    }
  });

  test('Login successfully', async () => {
    const login = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });
    expect(login).toBeDefined();
  });

  test('Missing codeChallengeMethod', () => {
    // If user submits codeChallenge, then codeChallengeMethod is required
    try {
      validateLoginRequest({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
        remember: false,
        codeChallenge: 'xyz',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code_challenge_method');
    }
  });

  test('Missing codeChallenge', () => {
    // If user submits codeChallengeMethod, then codeChallenge is required
    try {
      validateLoginRequest({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
        remember: false,
        codeChallengeMethod: 'plain',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code_challenge');
    }
  });

  test('Invalid codeChallengeMethod', () => {
    try {
      validateLoginRequest({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
        remember: false,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'xyz',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = err as OperationOutcome;
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('code_challenge_method');
    }
  });

  test('Plain text code challenge method', () => {
    expect(() =>
      validateLoginRequest({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
        remember: false,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      })
    ).not.toThrow();
  });

  test('S256 code challenge method', () => {
    expect(() =>
      validateLoginRequest({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
        remember: false,
        codeChallenge: 'xyz',
        codeChallengeMethod: 'S256',
      })
    ).not.toThrow();
  });
});
