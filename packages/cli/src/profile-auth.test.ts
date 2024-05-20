import { FetchLike, getStatus, isOperationOutcome, MedplumClient } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { sep } from 'node:path';
import { main } from '.';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';

jest.mock('node:os');
jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));
jest.mock('./util/client');
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  writeFile: jest.fn((path, data, callback) => {
    callback();
  }),
  readFileSync: jest.fn((filePath) => {
    if (filePath.endsWith('testPrivateKey.pem')) {
      return testPrivateKey;
    }
    return jest.requireActual('node:fs').readFileSync(filePath);
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
    const clientId = 'test-client-id';
    const accessTokenFromClientId = createFakeJwt({ client_id: clientId, login_id: '123' });

    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return { access_token: accessTokenFromClientId };
      }
      if (url.includes('auth/me')) {
        return { profile: { resourceType: 'Practitioner', id: '123' } };
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
      'jwt-bearer',
      '--client-id',
      clientId,
      '--client-secret',
      'validClientSecret',
      '--scope',
      'validScope',
      '--authorize-url',
      'https://valid.gov/authorize',
      '--subject',
      'john_doe',
      '--audience',
      '/oauth2/token',
      '--issuer',
      'https://valid.gov',
      '--token-url',
      '/oauth2/token',
    ]);

    expect(profile.getObject('activeLogin')).toEqual({
      accessToken: accessTokenFromClientId,
    });
  });

  test('JWT Assertion', async () => {
    const profileName = 'jwtAssertion';
    const jwtObj = {
      authType: 'jwt-assertion',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'oauth2/token',
      clientId: 'validClientId',
      clientSecret: 'validClientSecret',
      scope: 'validScope',
      authorizeUrl: 'https://valid.gov/authorize',
      privateKeyPath: 'testPrivateKey.pem',
      audience: '/oauth2/token',
    };

    const accessTokenFromClientId = createFakeJwt({ client_id: 'test-client-id', login_id: '123' });

    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token: accessTokenFromClientId,
        };
      }
      if (url.includes('auth/me')) {
        return { profile: { resourceType: 'Practitioner', id: '123' } };
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
      '--client-secret',
      jwtObj.clientSecret,
      '--token-url',
      jwtObj.tokenUrl,
      '--authorize-url',
      jwtObj.authorizeUrl,
      '--private-key-path',
      jwtObj.privateKeyPath,
      '--token-url',
      jwtObj.tokenUrl,
      '--base-url',
      jwtObj.baseUrl,
      '--audience',
      jwtObj.audience,
    ]);

    expect(profile.getObject('activeLogin')).toEqual({
      accessToken: accessTokenFromClientId,
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

const testPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpgIBAAKCAQEA3e9c5RfJuzNoTMmHAeTn3tcMxK5nPt+AmDMaMkEr+XA4+du8
puQ1eUrvttq9kMp5pF/pvXxi9LhXqsg1VeYBGTiiDox1201ei7LDyOiXdHCyF7Fz
zi3jXWpl8tl1XSLnv2jak0l7gZAxltL6G3VHpHXg68ACLflfGiW4nSpqp0XX/bQY
6PKQ2HYydAvrKDwCO9bceTBW4QmxLtaEZyHduLfm+sBLpK48KElptBaHXl3cGAZA
ntPn0ue0vj1m34/1CBzuPIOw7Qw6WXxIFifkzDFfr7quAJatN2cbgOu1DDnbPEcH
e4HTwUyKjrrJxePHa/E4NO+jKi+ttuldxNAI/QIDAQABAoIBAQCCIuJo33sGD03g
gOduf+hK7fTpu46E+o+wL37z6u07NcfjEyta/UQx3HQV18wChAeyEB/CYZaxAws8
9Gr59IW+YUv9lfVh48tFxUwymdh9ibuUUxSh2JyS4VnofgTo2RflUDmi1hrazU+W
rh3ETg/1ar2533wnsytF7MqFNiMV87H2wc1Tk7ruPov9vobkPhq4OqFKzuPjzUTu
UwSVyDMfV9Gud9X13JzpdgkcEEyKyINZyxSDik1UrCRF+hDpc9iP7UWcuPHeHBrU
7LynQi31Jo9WrIFTd4yY9QjCa35EpakpfAqTlHzG3rAUP93Fh9c7G/ANa+hm01VI
LsCtswbhAoGBAPDPrD4wNZoGEoVgvRj5xISFhiQ59WY1cYf8p0vn06T+NB1JndBK
FzDVoiz+TE2k5V6PCGRRbrzAMsTIp1AMcFOy62QfgjAmkSaadAxBjCmyPaYBrGxZ
zeWI7zUkPYUjv1+WvByg0ym3urd+m04RlGGHHl2Z2xR2j38Saqps4XAZAoGBAOvu
5mENDdiqLuapz48/NtH1q/sMBWHwrKrOugDOri0qwdBufP2aq89f0txDJaps7Zgo
3jc6wdUcivne/N2ZCSPy8TDw0Mag/UCm8J1G5X5kRcDhK+Thui8WMvr/K1rNLEG1
naZGdCw0D6SjcgcEOBPE//jcTEh/GASEgWmrYKyFAoGBAOomRCjD35rARMoD4lqi
of7phiE7ae3UEWxUsqcP568Krcm8hwK8yAfn8iUlrzPgHlbvZQ2GUNKfX74QDP+8
2IvJ8TANox0GoySSEjzIj20Lrv33qpxARf/mQhG+B0OqGq7rdkWv6yMpTxiUtpYW
adza8R+6NleTYLwCQE0uSZYhAoGBAI++kRxGMM51+XdNtIjpEcRgMrUUwN7IHNtA
cnD1e4dHSqhr+LkmmFETZ8wNGRC5pxSSqbjqkpf9+Op+In/8smX1qV+RCRJLmaDf
VS/ttvsHqrv2NKERqjbwBoWIG+kJolIyjed1e2hHG9TKRDnkJypcVzxPNCbjUEXI
WXSBFrhlAoGBAOl3AC4VhQEYp5eUu8/n1moVfhBQlpr7+fSXm6LOp7uLzxVzxHH1
btTekikziD1k3VcLVKhUWqzRLB1chSePSqik9hg5GhW7IKF/susg45p3ZJXR/M7j
LRHEVpYBnSkJLEuR0xus3dEOAQK4Nkc/le++9gzG4eN8KdI6p3/zFPgr
-----END RSA PRIVATE KEY-----
`;
