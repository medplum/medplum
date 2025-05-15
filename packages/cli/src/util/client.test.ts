import { MedplumClientOptions } from '@medplum/core';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { sep } from 'node:path';
import { FileSystemStorage } from '../storage';
import { createMedplumClient } from './client';

jest.mock('node:os');
jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  writeFile: jest.fn((path, data, callback) => {
    callback();
  }),
}));
const testHomeDir = mkdtempSync(__dirname + sep + 'storage-');

const originalWindow = globalThis.window;

describe('createMedplumClient', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    console.log = jest.fn();
  });

  afterEach(() => {
    process.env = env;
  });

  beforeAll(async () => {
    Object.defineProperty(globalThis, 'window', { get: () => originalWindow });
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
  });

  afterAll(async () => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  test('no options and no env set', async () => {
    const medplumClient = await createMedplumClient({});
    expect(medplumClient.getBaseUrl()).toContain('https://api.medplum.com/');
  });

  test('with optional env set', async () => {
    process.env.MEDPLUM_BASE_URL = 'http://example.com';
    process.env.MEDPLUM_FHIR_URL_PATH = 'fhir/test/path/';
    process.env.MEDPLUM_CLIENT_ACCESS_TOKEN = 'test-access-token';
    process.env.MEDPLUM_TOKEN_URL = 'http://example.com/oauth/token';
    const medplumClient = await createMedplumClient({});

    expect(medplumClient.getBaseUrl()).toContain('http://example.com/');
    expect(medplumClient.getAccessToken()).toBe('test-access-token');
    expect(medplumClient.fhirUrl('test').toString()).toContain('/fhir/test/path/');
  });

  test('with global options set', async () => {
    const options: MedplumClientOptions = {
      baseUrl: 'http://example.com/',
      fhirUrlPath: '/fhir/test/path/',
      tokenUrl: 'http://example.com/oauth/token',
      accessToken: 'test-access-token',
    };
    process.env.MEDPLUM_BASE_URL = 'http://example.com';
    process.env.MEDPLUM_FHIR_URL_PATH = '/fhir/test/path/';
    process.env.MEDPLUM_CLIENT_ACCESS_TOKEN = 'test_token';
    process.env.MEDPLUM_TOKEN_URL = 'http://example.com/oauth/token';
    const medplumClient = await createMedplumClient(options);

    expect(medplumClient.getBaseUrl()).toContain('http://example.com/');
    expect(medplumClient.getAccessToken()).toBe('test-access-token');
    expect(medplumClient.fhirUrl('test').toString()).toContain('/fhir/test/path/');
  });

  test('setBasicAuth and startClientLogin', async () => {
    const testProfile = 'testProfile';
    const accessToken =
      'header.' + Buffer.from(JSON.stringify({ cid: 'testclientid' })).toString('base64') + '.signature';
    const storage = new FileSystemStorage(testProfile);
    storage.setObject('options', { name: testProfile, authType: 'client_credentials' });

    const fetch = jest.fn(async () => {
      return {
        status: 200,
        ok: true,
        json: jest.fn(async () => ({
          access_token: accessToken,
        })),
      };
    });
    process.env.MEDPLUM_CLIENT_ID = 'testclientid';
    process.env.MEDPLUM_CLIENT_SECRET = 'secret123';
    const medplumClient = await createMedplumClient({ fetch, profile: testProfile });

    expect(medplumClient.getAccessToken()).toBeDefined();
  });

  test('Unauthenticated', async () => {
    const fetch = jest.fn(async () => {
      return {
        status: 401,
      };
    });

    const medplumClient = await createMedplumClient({ fetch });
    try {
      await medplumClient.post('Patient', {});
      throw new Error('testing');
    } catch {
      expect(console.log).toHaveBeenCalledWith('Unauthenticated: run `npx medplum login` to sign in');
    }
  });
});
