import { ClientApplication, isOk } from '@medplum/core';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { createTestClient } from '../jest.setup';
import { seedDatabase } from '../seed';
import { initKeys } from './keys';
import { tryLogin, validateLoginRequest } from './utils';

let client: ClientApplication;

describe('OAuth utils', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initKeys(config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Login with invalid client ID', async () => {
    const [outcome, login] = await tryLogin({
      clientId: randomUUID(),
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false
    });

    expect(isOk(outcome)).toBe(false);
    expect(login).toBeUndefined();
  });

  test('Login with missing email', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: '',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false
    });

    expect(isOk(outcome)).toBe(false);
    expect(login).toBeUndefined();
  });

  test('Login with missing password', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: '',
      scope: 'openid',
      nonce: 'nonce',
      remember: false
    });

    expect(isOk(outcome)).toBe(false);
    expect(login).toBeUndefined();
  });

  test('Login with missing ', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false
    });

    expect(isOk(outcome)).toBe(true);
    expect(login).toBeDefined();
  });

  test('Login successfully', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false
    });

    expect(isOk(outcome)).toBe(true);
    expect(login).toBeDefined();
  });

  test('Validate code challenge login request', () => {
    // If user submits codeChallenge, then codeChallengeMethod is required
    expect(validateLoginRequest({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
      codeChallenge: 'xyz'
    })?.issue?.[0]?.expression).toEqual(['code_challenge_method']);

    // If user submits codeChallengeMethod, then codeChallenge is required
    expect(validateLoginRequest({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
      codeChallengeMethod: 'plain'
    })?.issue?.[0]?.expression).toEqual(['code_challenge']);

    // Code challenge method
    expect(validateLoginRequest({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'xyz'
    })?.issue?.[0]?.expression).toEqual(['code_challenge_method']);

    // Code challenge method 'plain' is ok
    expect(validateLoginRequest({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain'
    })).toBeUndefined();

    // Code challenge method 'S256' is ok
    expect(validateLoginRequest({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain'
    })).toBeUndefined();
  });

});
