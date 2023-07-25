import { main } from '.';
import os from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import { FetchLike, MedplumClient, getStatus, isOperationOutcome } from '@medplum/core';
import { createMedplumClient } from './util/client';
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

const originalWindow = globalThis.window;

describe('Profiles Auth', () => {
  beforeEach(async () => {
    console.log = jest.fn();
  });

  let fetch: any;
  beforeAll(async () => {
    Object.defineProperty(globalThis, 'window', { get: () => originalWindow });
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
  });

  afterAll(async () => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  test('Token Exchange Authentication', async () => {
    const profileName = 'tokenExchangeProfile';
    const tokenExchangeObj = {
      authType: 'token-exchange',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      clientId: 'validClientId',
      accessToken: 'validAccessToken',
    };
    fetch = mockFetch(200, (url) => {
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: tokenExchangeObj.clientId, login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: tokenExchangeObj.clientId }),
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: {} };
      }
      return {};
    });
    const medplum = new MedplumClient({ fetch, clientId: tokenExchangeObj.clientId });
    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);

    await main([
      'node',
      'index.js',
      'login',
      '-p',
      profileName,
      '--auth-type',
      tokenExchangeObj.authType,
      '--client-id',
      tokenExchangeObj.clientId,
      '--access-token',
      tokenExchangeObj.accessToken,
    ]);

    expect(medplum.getAccessToken()).toBeDefined();
  });

  test('JWT Authentication', async () => {
    const profileName = 'jwtProfile';
    const jwtObj = {
      authType: 'jwt-bearer',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken.gov',
      clientId: 'validClientId',
      assertion: 'validAssertion',
      scope: 'validScope',
    };
    fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: jwtObj.clientId, login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: jwtObj.clientId }),
          profile: { reference: 'ClientApplication/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'ClientApplication' } };
      }
      return {};
    });

    const medplum = new MedplumClient({ fetch });
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
      '--assertion',
      jwtObj.assertion,
      '--scope',
      jwtObj.scope,
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

function createFakeJwt(claims: Record<string, string | number>): string {
  const header = { alg: 'HS256', typ: 'JWT' };

  const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString('base64');
  const base64UrlPayload = Buffer.from(JSON.stringify(claims)).toString('base64');
  const mockSignature = 'mock-signature';

  return `${base64UrlHeader}.${base64UrlPayload}.${mockSignature}`;
}
