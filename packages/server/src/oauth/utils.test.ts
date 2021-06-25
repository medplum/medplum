import { ClientApplication } from '@medplum/core';
import { loadConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { isOk, repo } from '../fhir';
import { seedDatabase } from '../seed';
import { initKeys } from './keys';
import { tryLogin } from './utils';

let client: ClientApplication;

beforeAll(async () => {
  const config = await loadConfig('file:medplum.config.json');
  await initDatabase({ client: 'sqlite3' });
  await seedDatabase();
  await initKeys(config);

  const [outcome, result] = await repo.createResource({
    resourceType: 'ClientApplication',
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

test('Login with missing client ID', async (done) => {
  const [outcome, login] = await tryLogin({
    clientId: '',
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(false);
  expect(login).toBeUndefined();
  done();
});

test('Login with missing email', async (done) => {
  const [outcome, login] = await tryLogin({
    clientId: client.id as string,
    email: '',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(false);
  expect(login).toBeUndefined();
  done();
});

test('Login with missing password', async (done) => {
  const [outcome, login] = await tryLogin({
    clientId: client.id as string,
    email: 'admin@medplum.com',
    password: '',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(false);
  expect(login).toBeUndefined();
  done();
});

test('Login with missing role', async (done) => {
  const [outcome, login] = await tryLogin({
    clientId: client.id as string,
    email: 'admin@medplum.com',
    password: 'admin',
    role: '' as 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(false);
  expect(login).toBeUndefined();
  done();
});

test('Login with missing ', async (done) => {
  const [outcome, login] = await tryLogin({
    clientId: client.id as string,
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(true);
  expect(login).not.toBeUndefined();
  done();
});

test('Login successfully', async (done) => {
  const [outcome, login] = await tryLogin({
    clientId: client.id as string,
    email: 'admin@medplum.com',
    password: 'admin',
    role: 'practitioner',
    scope: 'openid',
    nonce: 'nonce',
    remember: false
  });

  expect(isOk(outcome)).toBe(true);
  expect(login).not.toBeUndefined();
  done();
});
