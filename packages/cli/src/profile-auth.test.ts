import { main } from '.';
import os from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import { createMedplumClient } from './util/client';
import { FileSystemStorage } from './storage';
import { FetchLike, MedplumClient, getStatus, isOperationOutcome } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';

jest.mock('os');
jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));
jest.mock('./util/client');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFile: jest.fn((path, data, callback) => {
    callback();
  }),
}));

const testHomeDir = mkdtempSync(__dirname + sep + 'storage-');

const originalWindow = globalThis.window;

describe('Profiles Auth', () => {
  beforeEach(async () => {
    console.log = jest.fn();
  });

  beforeAll(async () => {
    Object.defineProperty(globalThis, 'window', { get: () => originalWindow });
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
  });

  afterAll(async () => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  test('JWT Bearer', async () => {
    const profileName = 'jwtProfile';
    const jwtObj = {
      authType: 'jwt-bearer',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken.gov',
      clientId: 'validClientId',
      clientSecret: 'validClientSecret',
      scope: 'validScope',
      audience: 'https://api.example.com',
      authorizeUrl: 'https://valid.gov/authorize',
      subject: 'john_doe',
    };

    const accessTokenFromClientId = createFakeJwt({ client_id: 'test-client-id', login_id: '123' });
    const refreshTokenFromClientId = createFakeJwt({ client_id: 'test-client-id' });

    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token: accessTokenFromClientId,
          refresh_token: refreshTokenFromClientId,
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'ClientApplication' } };
      }
      return {};
    });
    const profile = new FileSystemStorage(profileName);

    const medplum = new MedplumClient({ fetch, storage: profile });
    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);

    await main([
      'node',
      'index.js',
      'login',
      '-p',
      profileName,
      '--auth-type',
      jwtObj.authType,
      '--client-id',
      jwtObj.clientId,
      '--scope',
      jwtObj.scope,
      '--authorize-url',
      jwtObj.authorizeUrl,
      '--subject',
      jwtObj.subject,
      '--audience',
      jwtObj.audience,
      '--client-secret',
      jwtObj.clientSecret,
    ]);

    expect(profile.getObject('activeLogin')).toEqual({
      accessToken: accessTokenFromClientId,
      refreshToken: refreshTokenFromClientId,
    });
  });
});

function createFakeJwt(claims: Record<string, string | number>): string {
  const payload = JSON.stringify(claims);
  const encodedPayload = Buffer.from(payload).toString('base64');

  return `header.${encodedPayload}.signature`;
}

function mockFetch(
  status: number,
  body: OperationOutcome | Record<string, unknown> | ((url: string, options?: any) => any),
  contentType = 'application/fhir+json'
): FetchLike & jest.Mock {
  const bodyFn = typeof body === 'function' ? body : () => body;
  return jest.fn((url: string, options?: any) => {
    const response = bodyFn(url, options);
    const responseStatus = isOperationOutcome(response) ? getStatus(response) : status;
    return Promise.resolve({
      ok: responseStatus < 400,
      status: responseStatus,
      headers: { get: () => contentType },
      blob: () => Promise.resolve(response),
      json: () => Promise.resolve(response),
    });
  });
}
