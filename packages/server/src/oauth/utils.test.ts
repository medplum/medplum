import { ClientApplication, isOk } from '@medplum/core';
import { loadTestConfig } from '../config';
import { MEDPLUM_PROJECT_ID } from '../constants';
import { closeDatabase, initDatabase } from '../database';
import { repo } from '../fhir';
import { seedDatabase } from '../seed';
import { initKeys } from './keys';
import { tryLogin, validateLoginRequest } from './utils';

let client: ClientApplication;

beforeAll(async () => {
  const config = await loadTestConfig();
  await initDatabase(config.database);
  await seedDatabase();
  await initKeys(config);

  const [outcome, result] = await repo.createResource({
    resourceType: 'ClientApplication',
    project: {
      reference: 'Project/' + MEDPLUM_PROJECT_ID
    },
    secret: 'big-long-string',
    redirectUri: 'https://example.com'
  } as ClientApplication);

  if (!isOk(outcome) || !result) {
    throw new Error('Error creating application');
  }

  client = result;
});

afterAll(async () => {
  await closeDatabase();
});

test('Login with missing client ID', async () => {
  const [outcome, login] = await tryLogin({
    clientId: '',
    authMethod: 'password',
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
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
    role: 'practitioner',
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
    email: 'admin@medplum.com',
    password: '',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(false);
  expect(login).toBeUndefined();
});

test('Login with missing role', async () => {
  const [outcome, login] = await tryLogin({
    clientId: client.id as string,
    authMethod: 'password',
    email: 'admin@medplum.com',
    password: 'admin',
    role: '' as 'practitioner',
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
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(true);
  expect(login).not.toBeUndefined();
});

test('Login successfully', async () => {
  const [outcome, login] = await tryLogin({
    clientId: client.id as string,
    authMethod: 'password',
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(true);
  expect(login).not.toBeUndefined();
});

test('Validate code challenge login request', () => {
  // If user submits codeChallenge, then codeChallengeMethod is required
  expect(validateLoginRequest({
    clientId: client.id as string,
    authMethod: 'password',
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false,
    codeChallenge: 'xyz'
  })?.issue?.[0]?.expression).toEqual(['code_challenge_method']);

  // If user submits codeChallengeMethod, then codeChallenge is required
  expect(validateLoginRequest({
    clientId: client.id as string,
    authMethod: 'password',
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false,
    codeChallengeMethod: 'plain'
  })?.issue?.[0]?.expression).toEqual(['code_challenge']);

  // Code challenge method
  expect(validateLoginRequest({
    clientId: client.id as string,
    authMethod: 'password',
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
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
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
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
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false,
    codeChallenge: 'xyz',
    codeChallengeMethod: 'plain'
  })).toBeUndefined();
});
