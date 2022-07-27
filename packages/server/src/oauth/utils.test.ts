import { isOk } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { createTestClient } from '../test.setup';
import { initKeys } from './keys';
import { tryLogin, validateLoginRequest } from './utils';

let client: ClientApplication;

describe('OAuth utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await seedDatabase();
    await initKeys(config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
  });

  test('Login with invalid client ID', async () => {
    const [outcome, login] = await tryLogin({
      clientId: randomUUID(),
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });

    expect(isOk(outcome)).toBe(false);
    expect(login).toBeUndefined();
  });

  test('Login with missing email', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: '',
      password: 'medplum_admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
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
      remember: false,
    });

    expect(isOk(outcome)).toBe(false);
    expect(login).toBeUndefined();
  });

  test('User not found', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'user-not-found@example.com',
      password: 'medplum_admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });

    expect(isOk(outcome)).toBe(false);
    expect(login).toBeUndefined();
  });

  test('Blank authentication method', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: '' as unknown as 'password',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0]?.details?.text).toBe('Invalid authentication method');
    expect(login).toBeUndefined();
  });

  test('Invalid authentication method', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'xyz' as unknown as 'password',
      email: 'admin@example.com',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0]?.details?.text).toBe('Invalid authentication method');
    expect(login).toBeUndefined();
  });

  test('Invalid google credentials', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'google',
      email: 'admin@example.com',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0]?.details?.text).toBe('Invalid google credentials');
    expect(login).toBeUndefined();
  });

  test('Invalid scope', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: '',
      nonce: 'nonce',
      remember: false,
    });

    expect(isOk(outcome)).toBe(false);
    expect(outcome.issue?.[0]?.details?.text).toBe('Invalid scope');
    expect(login).toBeUndefined();
  });

  test('Login successfully', async () => {
    const [outcome, login] = await tryLogin({
      clientId: client.id as string,
      authMethod: 'password',
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
      nonce: 'nonce',
      remember: false,
    });

    expect(isOk(outcome)).toBe(true);
    expect(login).toBeDefined();
  });

  test('Validate code challenge login request', () => {
    // If user submits codeChallenge, then codeChallengeMethod is required
    expect(
      validateLoginRequest({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
        remember: false,
        codeChallenge: 'xyz',
      })?.issue?.[0]?.expression
    ).toEqual(['code_challenge_method']);

    // If user submits codeChallengeMethod, then codeChallenge is required
    expect(
      validateLoginRequest({
        clientId: client.id as string,
        authMethod: 'password',
        email: 'admin@example.com',
        password: 'medplum_admin',
        scope: 'openid',
        nonce: 'nonce',
        remember: false,
        codeChallengeMethod: 'plain',
      })?.issue?.[0]?.expression
    ).toEqual(['code_challenge']);

    // Code challenge method
    expect(
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
      })?.issue?.[0]?.expression
    ).toEqual(['code_challenge_method']);

    // Code challenge method 'plain' is ok
    expect(
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
    ).toBeUndefined();

    // Code challenge method 'S256' is ok
    expect(
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
    ).toBeUndefined();
  });
});
