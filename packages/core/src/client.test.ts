import {
  Bot,
  Bundle,
  Identifier,
  OperationOutcome,
  Patient,
  SearchParameter,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { randomUUID, webcrypto } from 'crypto';
import PdfPrinter from 'pdfmake';
import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { TextEncoder } from 'util';
import { encodeBase64 } from './base64';
import {
  DEFAULT_ACCEPT,
  FetchLike,
  InviteRequest,
  MedplumClient,
  MedplumClientEventMap,
  NewPatientRequest,
  NewProjectRequest,
  NewUserRequest,
} from './client';
import { createFakeJwt, mockFetch, mockFetchResponse } from './client-test-utils';
import { ContentType } from './contenttype';
import {
  OperationOutcomeError,
  accepted,
  allOk,
  badRequest,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from './outcomes';
import { MockAsyncClientStorage } from './storage';
import { getDataType, isDataTypeLoaded, isProfileLoaded } from './typeschema/types';
import { ProfileResource, createReference, sleep } from './utils';

const patientStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://example.com/patient',
  status: 'active',
  kind: 'resource',
  abstract: false,
  type: 'Patient',
  name: 'Patient',
  snapshot: {
    element: [
      {
        path: 'Patient',
      },
      {
        path: 'Patient.id',
        type: [
          {
            code: 'code',
          },
        ],
      },
    ],
  },
};

const patientSearchParameter: SearchParameter = {
  resourceType: 'SearchParameter',
  id: 'Patient-name',
  url: 'http://example.com/Patient-name',
  status: 'active',
  description: 'Search by name',
  type: 'string',
  base: ['Patient'],
  code: 'name',
  name: 'name',
  expression: 'Patient.name',
};

const schemaResponse = {
  data: {
    StructureDefinitionList: [patientStructureDefinition],
    SearchParameterList: [patientSearchParameter],
  },
};

const patientProfileUrl = 'http://example.com/patient-profile';
const patientProfileExtensionUrl = 'http://example.com/patient-profile-extension';

const profileSD = {
  resourceType: 'StructureDefinition',
  name: 'PatientProfile',
  url: patientProfileUrl,
  snapshot: {
    element: [
      {
        path: 'Patient',
      },
      {
        path: 'Patient.id',
        type: [
          {
            code: 'code',
          },
        ],
      },
      {
        path: 'Patient.extension',
        slicing: {
          discriminator: [
            {
              type: 'value',
              path: 'url',
            },
          ],
          ordered: false,
          rules: 'open',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
      },
      {
        path: 'Patient.extension',
        sliceName: 'fancy',
        type: [
          {
            code: 'Extension',
            profile: [patientProfileExtensionUrl],
          },
        ],
      },
    ],
  },
};

const profileExtensionSD = {
  resourceType: 'StructureDefinition',
  type: 'Extension',
  derivation: 'constraint',
  name: 'PatientProfile',
  url: patientProfileExtensionUrl,
  snapshot: {
    element: [
      {
        path: 'Extension',
      },
    ],
  },
};
const originalWindow = globalThis.window;
const originalBuffer = globalThis.Buffer;

describe('Client', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
  });

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(globalThis, 'Buffer', { get: () => originalBuffer });
    Object.defineProperty(globalThis, 'window', { get: () => originalWindow });
  });

  afterAll(() => {
    Object.defineProperty(globalThis.window, 'sessionStorage', { value: undefined });
  });

  test('Constructor', () => {
    expect(
      () =>
        new MedplumClient({
          clientId: 'xyz',
          baseUrl: 'x',
        })
    ).toThrow('Base URL must start with http or https');

    expect(
      () =>
        new MedplumClient({
          clientId: 'xyz',
          baseUrl: 'https://x/',
        })
    ).toThrow();

    expect(
      () =>
        new MedplumClient({
          clientId: 'xyz',
          baseUrl: 'https://x/',
          fetch: mockFetch(200, {}),
        })
    ).not.toThrow();

    expect(
      () =>
        new MedplumClient({
          fetch: mockFetch(200, {}),
        })
    ).not.toThrow();

    window.fetch = jest.fn();
    expect(() => new MedplumClient()).not.toThrow();
  });

  test('Missing trailing slash', () => {
    const client = new MedplumClient({ clientId: 'xyz', baseUrl: 'https://x' });
    expect(client.getBaseUrl()).toBe('https://x/');
  });

  test('Relative URLs', () => {
    const client = new MedplumClient({
      baseUrl: 'https://example.com',
      fhirUrlPath: 'my-fhir-url-path',
      authorizeUrl: 'my-authorize-url',
      tokenUrl: 'my-token-url',
      logoutUrl: 'my-logout-url',
    });
    expect(client.getBaseUrl()).toBe('https://example.com/');
    expect(client.getAuthorizeUrl()).toBe('https://example.com/my-authorize-url');
    expect(client.getTokenUrl()).toBe('https://example.com/my-token-url');
    expect(client.getLogoutUrl()).toBe('https://example.com/my-logout-url');
  });

  test('Absolute URLs', () => {
    const client = new MedplumClient({
      baseUrl: 'https://example.com',
      fhirUrlPath: 'https://fhir.example.com',
      authorizeUrl: 'https://authorize.example.com',
      tokenUrl: 'https://token.example.com',
      logoutUrl: 'https://logout.example.com',
    });
    expect(client.getBaseUrl()).toBe('https://example.com/');
    expect(client.getAuthorizeUrl()).toBe('https://authorize.example.com/');
    expect(client.getTokenUrl()).toBe('https://token.example.com/');
    expect(client.getLogoutUrl()).toBe('https://logout.example.com/');
  });

  test('getAuthorizeUrl', () => {
    const baseUrl = 'https://x';
    const authorizeUrl = 'https://example.com/custom/authorize';
    const client = new MedplumClient({ baseUrl, authorizeUrl });

    expect(client.getAuthorizeUrl()).toBe(authorizeUrl);
  });

  test('Restore from localStorage', async () => {
    window.localStorage.setItem(
      'activeLogin',
      JSON.stringify({
        accessToken: createFakeJwt({ client_id: '123', login_id: '123' }),
        refreshToken: '456',
        project: {
          reference: 'Project/123',
        },
        profile: {
          reference: 'Practitioner/123',
        },
      })
    );

    const fetch = mockFetch(200, (url) => {
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: '123', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: '123' }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('auth/me')) {
        return {
          project: { resourceType: 'Project', id: '123' },
          membership: { resourceType: 'ProjectMembership', id: '123' },
          profile: { resouceType: 'Practitioner', id: '123' },
          config: { resourceType: 'UserConfiguration', id: '123' },
          accessPolicy: { resourceType: 'AccessPolicy', id: '123' },
        };
      }
      return {};
    });

    const client = new MedplumClient({ baseUrl: 'https://x/', fetch });
    expect(client.getBaseUrl()).toEqual('https://x/');
    expect(client.isLoading()).toBe(true);
    expect(client.getProject()).toBeUndefined();
    expect(client.getProjectMembership()).toBeUndefined();
    expect(client.getProfile()).toBeUndefined();
    expect(client.getProfileAsync()).toBeDefined();
    expect(client.getUserConfiguration()).toBeUndefined();
    expect(client.getAccessPolicy()).toBeUndefined();

    const profile = (await client.getProfileAsync()) as ProfileResource;
    expect(client.isLoading()).toBe(false);
    expect(profile.id).toBe('123');
    expect(client.getProject()).toBeDefined();
    expect(client.getProjectMembership()).toBeDefined();
    expect(client.getProfile()).toBeDefined();
    expect(client.getUserConfiguration()).toBeDefined();
    expect(client.getAccessPolicy()).toBeDefined();
    expect(client.isSuperAdmin()).toBe(false);
    expect(client.isProjectAdmin()).toBe(false);
  });

  test('Admin check', async () => {
    window.localStorage.setItem(
      'activeLogin',
      JSON.stringify({
        accessToken: createFakeJwt({ client_id: '123', login_id: '123' }),
        refreshToken: '456',
        project: {
          reference: 'Project/123',
        },
        profile: {
          reference: 'Practitioner/123',
        },
      })
    );

    const fetch = mockFetch(200, (url) => {
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: '123', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: '123' }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('auth/me')) {
        return {
          project: { resourceType: 'Project', id: '123', superAdmin: true },
          membership: { resourceType: 'ProjectMembership', id: '123', admin: true },
          profile: { resouceType: 'Practitioner', id: '123' },
          config: { resourceType: 'UserConfiguration', id: '123' },
          accessPolicy: { resourceType: 'AccessPolicy', id: '123' },
        };
      }
      return {};
    });

    const client = new MedplumClient({ baseUrl: 'https://x/', fetch });
    const profile = (await client.getProfileAsync()) as ProfileResource;
    expect(profile.id).toBe('123');
    expect(client.isSuperAdmin()).toBe(true);
    expect(client.isProjectAdmin()).toBe(true);
  });

  test('Clear', () => {
    const client = new MedplumClient({ fetch: mockFetch(200, {}) });
    expect(() => client.clear()).not.toThrow();
    expect(sessionStorage.length).toEqual(0);
  });

  test('SignOut', async () => {
    const client = new MedplumClient({ fetch: mockFetch(200, {}) });
    await client.signOut();
    expect(client.getActiveLogin()).toBeUndefined();
    expect(client.getProfile()).toBeUndefined();
  });

  test('Sign in direct', async () => {
    const fetch = mockFetch(200, { login: '123', code: 'abc' });
    const client = new MedplumClient({ fetch });
    const result1 = await client.startLogin({ email: 'admin@example.com', password: 'admin' });
    expect(result1).toBeDefined();
    expect(result1.login).toBeDefined();
    expect(result1.code).toBeDefined();
  });

  test('Sign in with Google', async () => {
    const fetch = mockFetch(200, { login: '123', code: '123' });
    const client = new MedplumClient({ fetch });
    const result1 = await client.startGoogleLogin({
      googleClientId: 'google-client-id',
      googleCredential: 'google-credential',
    });
    expect(result1).toBeDefined();
    expect(result1.login).toBeDefined();
  });

  test('SignInWithRedirect', async () => {
    // Mock window.location.assign
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    const fetch = mockFetch(200, (url) => {
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: '123', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: '123' }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'Patient' } };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });

    // First, test the initial reidrect
    const result1 = await client.signInWithRedirect();
    expect(result1).toBeUndefined();
    expect(assign).toHaveBeenCalledWith(expect.stringMatching(/authorize\?.+scope=/));

    // Mock response code
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
        search: new URLSearchParams({ code: 'test-code' }),
      },
      writable: true,
    });

    // Next, test processing the response code
    const result2 = await client.signInWithRedirect();
    expect(result2).toBeDefined();
  });

  test('SignOutWithRedirect', async () => {
    // Mock window.location.assign

    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
      },
      writable: true,
    });

    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    client.signOutWithRedirect();
    expect(window.location.assign).toHaveBeenCalled();
  });

  test('Sign in with external auth', async () => {
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.signInWithExternalAuth(
      'https://auth.example.com/authorize',
      'external-client-123',
      'https://me.example.com',
      {
        clientId: 'medplum-client-123',
      }
    );
    expect(result).toBeUndefined();
    expect(assign).toHaveBeenCalledWith(expect.stringMatching(/authorize\?.+scope=/));
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('code_challenge'));
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('code_challenge_method'));
  });

  test('Sign in with external auth -- disabled PKCE', async () => {
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.signInWithExternalAuth(
      'https://auth.example.com/authorize',
      'external-client-123',
      'https://me.example.com',
      {
        clientId: 'medplum-client-123',
      },
      false
    );
    expect(result).toBeUndefined();
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining('code_challenge'));
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining('code_challenge_method'));
  });

  test('External auth token exchange', async () => {
    const clientId = 'medplum-client-123';
    const fetch = mockFetch(200, (url) => {
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: clientId, login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: clientId }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'Patient', id: '123' } };
      }
      return {};
    });
    const client = new MedplumClient({ fetch, clientId });

    expect(client.getAccessToken()).toBeUndefined();
    const result1 = await client.exchangeExternalAccessToken('we12e121');
    expect(result1).toBeDefined();

    expect(result1.resourceType).toBeDefined();
    expect(client.getAccessToken()).toBeDefined();
  });

  test('External auth token exchange with clientId param', async () => {
    const clientId1 = 'medplum-client-123';
    const clientId2 = 'medplum-client-456';
    const fetch = mockFetch(200, (url) => {
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: clientId2, login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: clientId2 }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'Patient', id: '123' } };
      }
      return {};
    });
    let client = new MedplumClient({ fetch, clientId: clientId1 });

    expect(client.getAccessToken()).toBeUndefined();
    await expect(client.exchangeExternalAccessToken('we12e121', clientId2)).rejects.toBeDefined();

    client = new MedplumClient({ fetch });
    const result1 = await client.exchangeExternalAccessToken('we12e121', clientId2);
    expect(result1).toBeDefined();

    expect(result1.resourceType).toBeDefined();
    expect(client.getAccessToken()).toBeDefined();
  });

  test('External auth token exchange w/o client ID', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });

    await expect(client.exchangeExternalAccessToken('we12e121')).rejects.toEqual(
      new Error('MedplumClient is missing clientId')
    );
  });

  describe('Get external auth redirect URI', () => {
    let client: MedplumClient;

    beforeAll(() => {
      const fetch = mockFetch(200, {});
      client = new MedplumClient({ fetch });
    });

    test('should give a valid url with all fields for PKCE exchange', async () => {
      const result = client.getExternalAuthRedirectUri(
        'https://auth.example.com/authorize',
        'external-client-123',
        'https://me.example.com',
        {
          clientId: 'medplum-client-123',
          ...(await client.startPkce()),
        }
      );
      expect(result).toMatch(/https:\/\/auth\.example\.com\/authorize\?.+scope=/);

      const { searchParams } = new URL(result);
      expect(searchParams.get('response_type')).toBe('code');
      expect(searchParams.get('code_challenge')).not.toBeNull();
      expect(typeof searchParams.get('code_challenge')).toBe('string');
      expect(searchParams.get('code_challenge_method')).toBe('S256');
      expect(searchParams.get('client_id')).toBe('external-client-123');
      expect(searchParams.get('redirect_uri')).toBe('https://me.example.com');
      expect(searchParams.get('scope')).not.toBeNull();
      expect(typeof searchParams.get('scope')).toBe('string');
      expect(searchParams.get('state')).not.toBeNull();
      expect(typeof searchParams.get('state')).toBe('string');
      expect(() => JSON.parse(searchParams.get('state') as string)).not.toThrow();
      expect(JSON.parse(searchParams.get('state') as string)?.codeChallengeMethod).toBe('S256');
      expect(typeof JSON.parse(searchParams.get('state') as string)?.codeChallenge).toBe('string');
    });

    test('PKCE disabled - should give a valid url without fields for PKCE', async () => {
      const result = client.getExternalAuthRedirectUri(
        'https://auth.example.com/authorize',
        'external-client-123',
        'https://me.example.com',
        {
          clientId: 'medplum-client-123',
        },
        false
      );
      expect(result).toMatch(/https:\/\/auth\.example\.com\/authorize\?.+scope=/);

      const { searchParams } = new URL(result);
      expect(searchParams.get('response_type')).toBe('code');
      expect(searchParams.get('client_id')).toBe('external-client-123');
      expect(searchParams.get('redirect_uri')).toBe('https://me.example.com');
      expect(searchParams.get('scope')).not.toBeNull();
      expect(typeof searchParams.get('scope')).toBe('string');
      expect(searchParams.get('state')).not.toBeNull();
      expect(typeof searchParams.get('state')).toBe('string');
      expect(() => JSON.parse(searchParams.get('state') as string)).not.toThrow();

      expect(searchParams.get('code_challenge')).toBeNull();
      expect(searchParams.get('code_challenge_method')).toBeNull();
      expect(JSON.parse(searchParams.get('state') as string)?.codeChallenge).toBeUndefined();
      expect(JSON.parse(searchParams.get('state') as string)?.codeChallengeMethod).toBeUndefined();
    });

    test('should throw if no `codeChallenge` is given', async () => {
      expect(() =>
        client.getExternalAuthRedirectUri(
          'https://auth.example.com/authorize',
          'external-client-123',
          'https://me.example.com',
          {
            clientId: 'medplum-client-123',
            codeChallengeMethod: 'S256',
          }
        )
      ).toThrow();
    });

    test('should throw if no `codeChallengeMethod` is given', async () => {
      expect(() =>
        client.getExternalAuthRedirectUri(
          'https://auth.example.com/authorize',
          'external-client-123',
          'https://me.example.com',
          {
            clientId: 'medplum-client-123',
            codeChallenge: 'xyz-123',
          }
        )
      ).toThrow();
    });

    test('should respect scope parameter', async () => {
      const result = client.getExternalAuthRedirectUri(
        'https://auth.example.com/authorize',
        'external-client-123',
        'https://me.example.com',
        {
          clientId: 'medplum-client-123',
          scope: 'profile email foo',
        },
        false
      );

      const { searchParams } = new URL(result);
      expect(searchParams.get('scope')).toBe('profile email foo');
    });
  });

  test('New project success', async () => {
    const fetch = mockFetch(200, (url) => {
      if (url.includes('/auth/newuser')) {
        return { login: '123' };
      }
      if (url.includes('/auth/newproject')) {
        return { login: '123', code: 'xyz' };
      }
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: '123', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: '123' }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'Patient' } };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });

    const newUserRequest: NewUserRequest = {
      firstName: 'Sally',
      lastName: 'Foo',
      email: `george@example.com`,
      password: 'password',
      recaptchaToken: 'xyz',
    };

    const response1 = await client.startNewUser(newUserRequest);
    expect(response1).toBeDefined();

    const newProjectRequest: NewProjectRequest = {
      login: response1.login,
      projectName: 'Sally World',
    };

    const response2 = await client.startNewProject(newProjectRequest);
    expect(response2).toBeDefined();

    const response3 = await client.processCode(response2.code as string);
    expect(response3).toBeDefined();
  });

  test('New patient success', async () => {
    const fetch = mockFetch(200, (url) => {
      if (url.includes('/auth/newuser')) {
        return { login: '123' };
      }
      if (url.includes('/auth/newpatient')) {
        return { login: '123', code: 'xyz' };
      }
      if (url.includes('/oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: '123', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: '123' }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'Patient' } };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });

    const newUserRequest: NewUserRequest = {
      firstName: 'Sally',
      lastName: 'Foo',
      email: `george@example.com`,
      password: 'password',
      recaptchaToken: 'xyz',
    };

    const response1 = await client.startNewUser(newUserRequest);
    expect(response1).toBeDefined();

    const newPatientRequest: NewPatientRequest = {
      login: response1.login,
      projectId: '123',
    };

    const response2 = await client.startNewPatient(newPatientRequest);
    expect(response2).toBeDefined();

    const response3 = await client.processCode(response2.code as string);
    expect(response3).toBeDefined();
  });

  test('Client credentials flow', async () => {
    let tokenExpired = true;

    const fetch = mockFetch(200, (url) => {
      if (url.includes('Patient/123')) {
        if (tokenExpired) {
          return unauthorized;
        } else {
          return { resourceType: 'Patient', id: '123' };
        }
      }
      if (url.includes('oauth2/token')) {
        tokenExpired = false;
        return {
          access_token: createFakeJwt({ client_id: 'test-client-id', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: 'test-client-id' }),
          profile: { reference: 'ClientApplication/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'ClientApplication' } };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    const result1 = await client.startClientLogin('test-client-id', 'test-client-secret');
    expect(result1).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);

    tokenExpired = true;
    fetch.mockClear();

    const result2 = await client.readResource('Patient', '123');
    expect(result2).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test('JWT bearer token flow', async () => {
    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: 'test-client-id', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: 'test-client-id' }),
          profile: { reference: 'ClientApplication/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'ClientApplication' } };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    const result1 = await client.startJwtBearerLogin('test-client-id', 'test-client-secret', 'openid profile');
    expect(result1).toBeDefined();
    expect(result1).toMatchObject({ resourceType: 'ClientApplication' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('JWT assertion flow', async () => {
    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token: createFakeJwt({ client_id: 'test-client-id', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: 'test-client-id' }),
          profile: { reference: 'ClientApplication/123' },
        };
      }
      if (url.includes('/auth/me')) {
        return { profile: { resourceType: 'ClientApplication' } };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    const result1 = await client.startJwtAssertionLogin('my-jwt');
    expect(result1).toBeDefined();
    expect(result1).toMatchObject({ resourceType: 'ClientApplication' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('Basic auth in browser', async () => {
    Object.defineProperty(globalThis, 'Buffer', { get: () => undefined });
    Object.defineProperty(globalThis, 'window', { get: () => originalWindow });

    const fetch = mockFetch(200, () => {
      return { resourceType: 'Patient', id: '123' };
    });

    const client = new MedplumClient({ fetch });
    client.setBasicAuth('test-client-id', 'test-client-secret');

    const result2 = await client.readResource('Patient', '123');
    expect(result2).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: DEFAULT_ACCEPT,
          Authorization: 'Basic dGVzdC1jbGllbnQtaWQ6dGVzdC1jbGllbnQtc2VjcmV0',
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Basic auth in Node.js', async () => {
    Object.defineProperty(globalThis, 'Buffer', { get: () => originalBuffer });
    Object.defineProperty(globalThis, 'window', { get: () => undefined });

    const fetch = mockFetch(200, () => {
      return { resourceType: 'Patient', id: '123' };
    });

    const client = new MedplumClient({ fetch });
    client.setBasicAuth('test-client-id', 'test-client-secret');

    const result2 = await client.readResource('Patient', '123');
    expect(result2).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: DEFAULT_ACCEPT,
          Authorization: 'Basic dGVzdC1jbGllbnQtaWQ6dGVzdC1jbGllbnQtc2VjcmV0',
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Basic auth and startClientLogin with valid token.cid', async () => {
    const patientId = randomUUID();
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const accessToken = createFakeJwt({ cid: clientId });
    const fetch = mockFetch(200, (url) => {
      if (url.includes(`Patient/${patientId}`)) {
        return { resourceType: 'Patient', id: patientId };
      }

      if (url.includes('oauth2/token')) {
        return {
          access_token: accessToken,
        };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    client.setBasicAuth(clientId, clientSecret);
    await client.startClientLogin(clientId, clientSecret);

    const result2 = await client.readResource('Patient', patientId);
    expect(result2).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.medplum.com/fhir/R4/Patient/${patientId}`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: DEFAULT_ACCEPT,
          Authorization: `Bearer ${accessToken}`,
          'X-Medplum': 'extended',
        },
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      `https://api.medplum.com/oauth2/token`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + encodeBase64(clientId + ':' + clientSecret),
          'Content-Type': ContentType.FORM_URL_ENCODED,
        },
      })
    );
  });

  test('Basic auth and startClientLogin with valid token.client_id', async () => {
    const patientId = randomUUID();
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const accessToken = createFakeJwt({ cid: clientId });
    const fetch = mockFetch(200, (url) => {
      if (url.includes(`Patient/${patientId}`)) {
        return { resourceType: 'Patient', id: patientId };
      }

      if (url.includes('oauth2/token')) {
        return {
          access_token: accessToken,
        };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    client.setBasicAuth(clientId, clientSecret);
    await client.startClientLogin(clientId, clientSecret);

    const result2 = await client.readResource('Patient', patientId);
    expect(result2).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.medplum.com/fhir/R4/Patient/${patientId}`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: DEFAULT_ACCEPT,
          Authorization: `Bearer ${accessToken}`,
          'X-Medplum': 'extended',
        },
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      `https://api.medplum.com/oauth2/token`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + encodeBase64(clientId + ':' + clientSecret),
          'Content-Type': ContentType.FORM_URL_ENCODED,
        },
      })
    );
  });

  test('Basic auth and startClientLogin with fetched token mismatched client id ', async () => {
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token:
            'header.' +
            Buffer.from(JSON.stringify({ client_id: 'different-client-id' })).toString('base64') +
            '.signature',
        };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    try {
      client.setBasicAuth(clientId, clientSecret);
      await client.startClientLogin(clientId, clientSecret);
      throw new Error('test');
    } catch (err) {
      expect((err as Error).message).toBe('Token was not issued for this audience');
    }
  });

  test('Basic auth and startClientLogin with fetched token contains mismatched cid', async () => {
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token: createFakeJwt({ cid: 'different-client-id' }),
        };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    try {
      client.setBasicAuth(clientId, clientSecret);
      await client.startClientLogin(clientId, clientSecret);
      throw new Error('test');
    } catch (err) {
      expect((err as Error).message).toBe('Token was not issued for this audience');
    }
  });

  test('Basic auth and startClientLogin Failed to fetch tokens', async () => {
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const fetch = mockFetch(500, () => ({}));
    const client = new MedplumClient({ fetch });
    try {
      client.setBasicAuth(clientId, clientSecret);
      await client.startClientLogin(clientId, clientSecret);
      throw new Error('test');
    } catch (err) {
      expect((err as Error).message).toBe('Failed to fetch tokens');
    }
  });

  test('Basic auth and startClientLogin Token expired', async () => {
    const clientId = 'test-client-id';
    const clientSecret = 'test-client-secret';
    const oneMinuteAgo = Date.now() / 1000 - 60;
    const fetch = mockFetch(200, (url) => {
      if (url.includes('oauth2/token')) {
        return {
          access_token: createFakeJwt({ exp: oneMinuteAgo }),
        };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });
    try {
      client.setBasicAuth(clientId, clientSecret);
      await client.startClientLogin(clientId, clientSecret);
      throw new Error('test');
    } catch (err) {
      expect((err as Error).message).toBe('Token expired');
    }
  });

  test('Invite user', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const body: InviteRequest = {
      resourceType: 'Patient',
      firstName: 'Sally',
      lastName: 'Foo',
      email: 'sally@foomedical.com',
      sendEmail: true,
    };
    const result = await client.invite('123', body);
    expect(result).toBeDefined();
  });

  test('HTTP GET', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const request1 = client.get('Practitioner/123');
    const request2 = client.get('Practitioner/123');
    expect(request2).toBe(request1);

    const request3 = client.get('Practitioner/123', { cache: 'reload' });
    expect(request3).not.toBe(request1);
  });

  test('Read expired and refresh', async () => {
    let tokenExpired = true;

    const fetch = mockFetch(200, (url) => {
      if (url.includes('Patient/123')) {
        if (tokenExpired) {
          return unauthorized;
        } else {
          return { resourceType: 'Patient', id: '123' };
        }
      }
      if (url.includes('oauth2/token')) {
        tokenExpired = false;
        return {
          access_token: createFakeJwt({ client_id: '123', login_id: '123' }),
          refresh_token: createFakeJwt({ client_id: '123' }),
          profile: { reference: 'Patient/123' },
        };
      }
      if (url.includes('auth/me')) {
        return {
          profile: { resourceType: 'Patient', id: '123' },
        };
      }
      return {};
    });

    const client = new MedplumClient({ fetch });

    const loginResponse = await client.startLogin({ email: 'admin@example.com', password: 'admin' });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();

    await client.processCode(loginResponse.code as string);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockClear();

    const result = await client.readResource('Patient', '123');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();

    // Set an expired token
    tokenExpired = true;
    client.setAccessToken(createFakeJwt({ exp: 0 }), createFakeJwt({ client_id: '123' }));
    client.invalidateAll();

    const result2 = await client.readResource('Patient', '123');
    expect(result2).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('Read expired and refresh with unAuthenticated callback', async () => {
    const fetch = mockFetch(401, unauthorized);
    const onUnauthenticated = jest.fn();
    const client = new MedplumClient({ fetch, onUnauthenticated });
    const result = client.get('expired');
    await expect(result).rejects.toThrow('Unauthenticated');
    expect(onUnauthenticated).toHaveBeenCalled();
  });

  test('fhirUrl', () => {
    const client = new MedplumClient({ fetch: jest.fn() });
    expect(client.fhirUrl().toString()).toBe('https://api.medplum.com/fhir/R4/');
    expect(client.fhirUrl('Patient').toString()).toBe('https://api.medplum.com/fhir/R4/Patient');
    expect(client.fhirUrl('Patient', '123').toString()).toBe('https://api.medplum.com/fhir/R4/Patient/123');
    expect(client.fhirUrl('Patient/123').toString()).toBe('https://api.medplum.com/fhir/R4/Patient/123');
  });

  test('Read resource', async () => {
    const fetch = mockFetch(200, { resourceType: 'Patient', id: '123' });
    const client = new MedplumClient({ fetch });
    const result = await client.readResource('Patient', '123');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
  });

  test('Read reference', async () => {
    const fetch = mockFetch(200, { resourceType: 'Patient', id: '123' });
    const client = new MedplumClient({ fetch });
    const result = await client.readReference({ reference: 'Patient/123' });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');

    try {
      await client.readReference({});
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Missing reference');
    }

    try {
      await client.readReference({ reference: '' });
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Missing reference');
    }

    try {
      await client.readReference({ reference: 'xyz' });
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Invalid reference');
    }

    try {
      await client.readReference({ reference: 'xyz?abc' });
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Invalid reference');
    }
  });

  test('Read cached resource', async () => {
    const fetch = mockFetch(200, { resourceType: 'Patient', id: '123' });
    const client = new MedplumClient({ fetch });
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Nothing in the cache
    const readPromise = client.readResource('Patient', '123');
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Promise in the cache
    const result = await readPromise;
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
    expect(client.getCached('Patient', '123')).toBe(result); // Value in the cache
  });

  test('Read cached resource not found', async () => {
    expect.assertions(7);
    const fetch = mockFetch(404, notFound);
    const client = new MedplumClient({ fetch });
    const reference = { reference: 'Patient/not-found' };
    expect(client.getCached('Patient', 'not-found')).toBeUndefined(); // Nothing in the cache
    expect(client.getCachedReference(reference)).toBeUndefined();
    const readPromise = client.readResource('Patient', 'not-found');
    expect(client.getCached('Patient', 'not-found')).toBeUndefined(); // Promise in the cache
    expect(client.getCachedReference(reference)).toBeUndefined();
    try {
      await readPromise;
    } catch (err) {
      expect(err).toBeDefined();
    }
    expect(client.getCached('Patient', 'not-found')).toBeUndefined(); // Should not throw
    expect(client.getCachedReference(reference)).toBeUndefined();
  });

  test('Read cached reference', async () => {
    const fetch = mockFetch(200, { resourceType: 'Patient', id: '123' });
    const client = new MedplumClient({ fetch });
    const reference = { reference: 'Patient/123' };
    expect(client.getCachedReference(reference)).toBeUndefined();
    const readPromise = client.readReference(reference);
    expect(client.getCachedReference(reference)).toBeUndefined(); // Promise in the cache
    const result = await readPromise;
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
    expect(client.getCachedReference(reference)).toBe(result);
    expect(client.getCachedReference({})).toBeUndefined();
    expect(client.getCachedReference({ reference: '' })).toBeUndefined();
    expect(client.getCachedReference({ reference: 'xyz' })).toBeUndefined();
    expect(client.getCachedReference({ reference: 'xyz?abc' })).toBeUndefined();
    expect(client.getCachedReference({ reference: 'system' })).toMatchObject({
      resourceType: 'Device',
      id: 'system',
      deviceName: [{ name: 'System' }],
    });
  });

  test('Read system reference', async () => {
    const client = new MedplumClient({ fetch });

    // Get
    expect(client.getCachedReference({ reference: 'system' })).toMatchObject({
      resourceType: 'Device',
      id: 'system',
      deviceName: [{ name: 'System' }],
    });

    // Read async
    const result = await client.readReference({ reference: 'system' });
    expect(result).toMatchObject({
      resourceType: 'Device',
      id: 'system',
      deviceName: [{ name: 'System' }],
    });
  });

  test('Disabled cache read cached resource', async () => {
    const fetch = mockFetch(200, { resourceType: 'Patient', id: '123' });
    const client = new MedplumClient({ fetch, cacheTime: 0 });
    expect((client as any).requestCache).toBeUndefined();
    expect((client as any).autoBatchQueue).toBeUndefined();
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Nothing in the cache
    const readPromise = client.readResource('Patient', '123');
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Cache is disabled
    const result = await readPromise;
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Cache is disabled
  });

  test('Read history', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.readHistory('Patient', '123');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123/_history',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('Read patient everything', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.readPatientEverything('123');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123/$everything',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('Create resource', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.createResource({ resourceType: 'Patient' });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.FHIR_JSON,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create resource missing resourceType', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    try {
      await client.createResource({} as Patient);
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Missing resourceType');
    }
  });

  test('Create resource if none exist returns existing', async () => {
    const fetch = mockFetch(200, { resourceType: 'Patient', id: '123' });
    const client = new MedplumClient({ fetch });
    const result = await client.createResourceIfNoneExist<Patient>(
      {
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      },
      'name:contains=alice'
    );
    expect(result).toBeDefined();
    expect(result.id).toBe('123'); // Expect existing patient
  });

  test('Create resource if none exist creates new', async () => {
    const fetch = mockFetch(200, (_url, options) => {
      if (options.method === 'GET') {
        return { resourceType: 'Bundle', total: 0, entry: [] };
      } else {
        return { resourceType: 'Patient', id: '123' };
      }
    });
    const client = new MedplumClient({ fetch });
    const result = await client.createResourceIfNoneExist<Patient>(
      {
        resourceType: 'Patient',
        name: [{ given: ['Bob'], family: 'Smith' }],
      },
      'name:contains=bob'
    );
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('Update resource', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.updateResource({ resourceType: 'Patient', id: '123' });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.FHIR_JSON,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Upsert resource', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.upsertResource(
      {
        resourceType: 'Patient',
        identifier: [{ system: 'http://example.com/mrn', value: '24601' }],
      },
      'identifier=http://example.com/mrn|24601'
    );
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient?identifier=http%3A%2F%2Fexample.com%2Fmrn%7C24601',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.FHIR_JSON,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Update resource validation', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    try {
      await client.updateResource({} as Patient);
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Missing resourceType');
    }
    try {
      await client.updateResource({ resourceType: 'Patient' });
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Missing id');
    }
  });

  test('Not modified', async () => {
    const fetch = mockFetch(304, { resourceType: 'Patient', id: '777' });
    const client = new MedplumClient({ fetch });
    const result = await client.updateResource({ resourceType: 'Patient', id: '777' });
    expect(result).not.toBeUndefined();
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('777');
  });

  test('Bad Request', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    try {
      await client.updateResource({ resourceType: 'Patient', id: '888' });
      fail('Expected error');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('Create attachment', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.createAttachment({
      data: 'Hello world',
      contentType: ContentType.TEXT,
    });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.TEXT,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create attachment (deprecated legacy version)', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.createAttachment('Hello world', undefined, ContentType.TEXT);
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.TEXT,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create binary', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.createBinary({
      data: 'Hello world',
      contentType: ContentType.TEXT,
    });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.TEXT,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create binary with filename', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.createBinary({
      data: 'Hello world',
      contentType: ContentType.TEXT,
      filename: 'hello.txt',
    });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary?_filename=hello.txt',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.TEXT,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create binary (deprecated legacy version)', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.createBinary('Hello world', undefined, ContentType.TEXT);
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.TEXT,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create binary with filename (deprecated legacy version)', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.createBinary('Hello world', 'hello.txt', ContentType.TEXT);
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary?_filename=hello.txt',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.TEXT,
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create binary with progress event listener', async () => {
    const xhrMock: Partial<XMLHttpRequest> = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
      upload: {} as XMLHttpRequestUpload,
      readyState: 4,
      status: 200,
      response: {
        resourceType: 'Binary',
      },
    };

    jest.spyOn(window, 'XMLHttpRequest').mockImplementation(() => xhrMock as XMLHttpRequest);

    const onProgress = jest.fn();

    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const promise = client.createBinary('Hello world', undefined, ContentType.TEXT, onProgress);
    expect(xhrMock.open).toHaveBeenCalled();
    expect(xhrMock.setRequestHeader).toHaveBeenCalled();

    // Emulate xhr progress events
    (xhrMock.upload?.onprogress as EventListener)(new Event(''));
    (xhrMock.upload?.onload as EventListener)(new Event(''));
    (xhrMock.onload as EventListener)(new Event(''));

    const result = await promise;
    expect(result).toBeDefined();
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  test('Create pdf not enabled', async () => {
    expect.assertions(1);
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    try {
      await client.createPdf({ docDefinition: { content: ['Hello world'] } });
    } catch (err) {
      expect((err as Error).message).toEqual('PDF creation not enabled');
    }
  });

  test('Create pdf success', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch, createPdf });
    const footer = jest.fn(() => 'footer');
    const result = await client.createPdf(
      {
        content: ['Hello World'],
        defaultStyle: {
          font: 'Helvetica',
        },
        footer,
      },
      undefined,
      undefined,
      fonts
    );
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': 'application/pdf',
          'X-Medplum': 'extended',
        },
      })
    );
    expect(footer).toHaveBeenCalled();
  });

  test('Create pdf with filename', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch, createPdf });
    const result = await client.createPdf(
      { content: ['Hello world'], defaultStyle: { font: 'Helvetica' } },
      'report.pdf',
      undefined,
      fonts
    );
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Binary?_filename=report.pdf',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': 'application/pdf',
          'X-Medplum': 'extended',
        },
      })
    );
  });

  test('Create comment on Encounter', async () => {
    const fetch = mockFetch(200, (_url, options) => JSON.parse(options.body));
    const client = new MedplumClient({ fetch });
    const result = await client.createComment(
      { resourceType: 'Encounter', id: '999', status: 'arrived', class: { code: 'test' } },
      'Hello world'
    );
    expect(result).toBeDefined();
    expect(result.basedOn).toBeDefined();
    expect(result.encounter).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Communication',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  test('Create comment on ServiceRequest', async () => {
    const fetch = mockFetch(200, (_url, options) => JSON.parse(options.body));
    const client = new MedplumClient({ fetch });
    const result = await client.createComment(
      {
        resourceType: 'ServiceRequest',
        id: '999',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/123' },
      },
      'Hello world'
    );
    expect(result).toBeDefined();
    expect(result.basedOn).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Communication',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  test('Create comment on Patient', async () => {
    const fetch = mockFetch(200, (_url, options) => JSON.parse(options.body));
    const client = new MedplumClient({ fetch });
    const result = await client.createComment({ resourceType: 'Patient', id: '999' }, 'Hello world');
    expect(result).toBeDefined();
    expect(result.basedOn).toBeDefined();
    expect(result.subject).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Communication',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  test('Patch resource', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.patchResource('Patient', '123', [
      { op: 'replace', path: '/name/0/family', value: 'Doe' },
    ]);
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });

  test('Delete resource', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.deleteResource('Patient', 'xyz');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/xyz',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  test('Validate resource', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.validateResource({ resourceType: 'Patient' });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/$validate',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  test('Execute bot by ID', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const bot: Bot = {
      resourceType: 'Bot',
      id: '123',
      name: 'Test Bot',
      identifier: [{ system: 'https://example.com', value: '123' }],
      code: 'export async function handler() {}',
    };

    const result1 = await client.executeBot(bot.id as string, {});
    expect(result1).toBeDefined();
    expect(fetch).toHaveBeenCalledWith('https://api.medplum.com/fhir/R4/Bot/123/$execute', expect.objectContaining({}));
  });

  test('Execute bot by Identifier', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const bot: Bot = {
      resourceType: 'Bot',
      id: '123',
      name: 'Test Bot',
      identifier: [{ system: 'https://example.com', value: '123' }],
      code: 'export async function handler() {}',
    };

    const result2 = await client.executeBot(bot.identifier?.[0] as Identifier, {});
    expect(result2).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https%3A%2F%2Fexample.com%7C123',
      expect.objectContaining({})
    );
  });

  test('Request schema', async () => {
    const fetch = mockFetch(200, schemaResponse);

    const client = new MedplumClient({ fetch });

    // Issue two requests simultaneously
    const request1 = client.requestSchema('Patient');
    const request2 = client.requestSchema('Patient');
    expect(request2).toBe(request1);

    await request1;
    expect(isDataTypeLoaded('Patient')).toBe(true);
  });

  test('requestProfileSchema', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: profileSD }],
    });

    const client = new MedplumClient({ fetch });

    // Issue two requests simultaneously
    const request1 = client.requestProfileSchema(patientProfileUrl);
    const request2 = client.requestProfileSchema(patientProfileUrl);
    expect(request2).toBe(request1);

    await request1;
    expect(isProfileLoaded(patientProfileUrl)).toBe(true);
    expect(getDataType(profileSD.name, patientProfileUrl)).toBeDefined();
  });

  test('requestProfileSchema expandProfile', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: profileSD }, { resource: profileExtensionSD }],
    });

    const client = new MedplumClient({ fetch });

    // Issue two requests simultaneously
    const request1 = client.requestProfileSchema(patientProfileUrl, { expandProfile: true });
    const request2 = client.requestProfileSchema(patientProfileUrl, { expandProfile: true });
    expect(request2).toBe(request1);

    await request1;
    await request2;
    expect(isProfileLoaded(patientProfileUrl)).toBe(true);
    expect(isProfileLoaded(patientProfileExtensionUrl)).toBe(true);
    expect(getDataType(profileSD.name, patientProfileUrl)).toBeDefined();
    expect(getDataType(profileExtensionSD.name, patientProfileExtensionUrl)).toBeDefined();
  });

  test('Search', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const result = await client.search('Patient', 'name:contains=alice');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient?name%3Acontains=alice',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('Search no filters', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const result = await client.search('Patient');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('Search one', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const result = await client.searchOne('Patient', 'name:contains=alice');
    expect(result).toBeDefined();
    expect(result?.resourceType).toBe('Patient');
  });

  test('Search one ReadablePromise', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const promise1 = client.searchOne('Patient', 'name:contains=alice');
    expect(() => promise1.read()).toThrow();
    const promise2 = client.searchOne('Patient', 'name:contains=alice');
    expect(promise2).toBe(promise1);
    await promise1;
    const result = promise1.read();
    expect(result).toBeDefined();
    expect(result?.resourceType).toBe('Patient');
  });

  test('Search resources', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const result = await client.searchResources('Patient', '_count=1&name:contains=alice');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].resourceType).toBe('Patient');
    expect(result.bundle).toBeDefined();
    expect(result.bundle.resourceType).toBe('Bundle');
  });

  test('Search resources with record of params', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const result = await client.searchResources('Patient', { _count: 1, 'name:contains': 'alice' });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].resourceType).toBe('Patient');
  });

  test('Search resources ReadablePromise', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const promise1 = client.searchResources('Patient', '_count=1&name:contains=alice');
    expect(() => promise1.read()).toThrow();
    const promise2 = client.searchResources('Patient', '_count=1&name:contains=alice');
    expect(promise2).toBe(promise1);
    await promise1;
    const result = promise1.read();
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].resourceType).toBe('Patient');
  });

  test('Search and cache', async () => {
    const fetch = mockFetch(200, {
      resourceType: 'Bundle',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    });
    const client = new MedplumClient({ fetch });
    const result = await client.search('Patient');
    expect(result).toBeDefined();
    expect(client.getCachedReference(createReference(result.entry?.[0]?.resource as Patient))).toBeDefined();
  });

  test('Search and return 404', async () => {
    const fetch = mockFetch(404, () => 'string_representation');

    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 404,
      headers: {
        get(name: string): string | undefined {
          return {
            'content-type': 'string_representation',
          }[name];
        },
      },
    }));

    const client = new MedplumClient({ fetch });
    try {
      await client.search('Patient');
    } catch (err) {
      expect((err as OperationOutcomeError).outcome).toMatchObject(notFound);
    }
  });

  describe('maxRetries', () => {
    test('should try 3 times by default', async () => {
      const fetch = mockFetch(500, serverError(new Error('Something is broken')));
      const client = new MedplumClient({ fetch });

      await expect(client.get(client.fhirUrl('Patient', '123'))).rejects.toThrow(
        'Internal server error (Error: Something is broken)'
      );
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('should only try once when maxRetries = 0', async () => {
      const fetch = mockFetch(500, serverError(new Error('Something is broken')));
      const client = new MedplumClient({ fetch });

      await expect(client.get(client.fhirUrl('Patient', '123'), { maxRetries: 0 })).rejects.toThrow(
        'Internal server error (Error: Something is broken)'
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test.each([400, 401, 404])('%d status code is not retried', async (statusCode) => {
      const fetch = mockFetch(statusCode, (): OperationOutcome => {
        switch (statusCode) {
          case 400:
            return badRequest('The request is not good');
          case 401:
            return unauthorized;
          case 404:
            return notFound;
          default:
            throw new Error('Invalid status code');
        }
      });
      const client = new MedplumClient({ fetch });

      switch (statusCode) {
        case 400:
          await expect(client.get(client.fhirUrl('Patient', '123'))).rejects.toThrow('The request is not good');
          break;
        case 401:
          await expect(client.get(client.fhirUrl('Patient', '123'))).rejects.toThrow('Unauthenticated');
          break;
        case 404:
          await expect(client.get(client.fhirUrl('Patient', '123'))).rejects.toThrow('Not found');
          break;
        default:
          throw new Error('Invalid status code');
      }

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('should not retry after request is aborted', async () => {
      const fetch = jest.fn().mockImplementation((async (_url: string, options?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (!options?.signal) {
            throw new Error('options.signal required for this test');
          }

          const timeout = setTimeout(() => {
            reject(new Error('Timeout'));
          }, 3000);

          options.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            const abortError = new Error('Request aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }) satisfies FetchLike);
      const client = new MedplumClient({ fetch });

      const controller = new AbortController();

      const getPromise = client.get(client.fhirUrl('Patient', '123'), { signal: controller.signal });
      await sleep(0);
      controller.abort();
      await expect(getPromise).rejects.toThrow('Request aborted');

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('should retry on fetch errors', async () => {
      const fetch = jest.fn().mockImplementation(async (_url: string, _options?: RequestInit) => {
        throw new Error('Some kind of fetch error occurred');
      });
      const client = new MedplumClient({ fetch });

      await expect(client.get(client.fhirUrl('Patient', '123'))).rejects.toThrow('Some kind of fetch error occurred');
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Paginated Search ', () => {
    let fetch: FetchLike;

    beforeEach(() => {
      const resources = [
        { resource: { resourceType: 'Patient', id: '123' } },
        { resource: { resourceType: 'Patient', id: '456' } },
        { resource: { resourceType: 'Patient', id: '789' } },
      ];
      fetch = mockFetch(200, (url) => {
        const parsedUrl = new URL(url);
        const offset = Number.parseInt(parsedUrl.searchParams.get('_offset') ?? '0', 10);
        const count = Number.parseInt(parsedUrl.searchParams.get('_count') ?? '1', 10);

        if (offset >= resources.length) {
          return {
            resourceType: 'Bundle',
            entry: [],
            link: [],
          };
        }
        parsedUrl.searchParams.set('_offset', (offset + count).toString());
        const nextLink = { relation: 'next', url: parsedUrl.toString() };
        return {
          resourceType: 'Bundle',
          entry: resources.slice(offset, offset + count),
          link: [nextLink],
        } as Bundle;
      });
    });

    test('Search resources pages', async () => {
      const client = new MedplumClient({ fetch });
      let numPages = 0;
      for await (const page of client.searchResourcePages('Patient', '_count=1')) {
        expect(page).toHaveLength(1);
        expect(page[0].resourceType).toBe('Patient');
        numPages += 1;
      }
      expect(numPages).toBe(3);
    });

    test('Search resources pages uneven', async () => {
      const client = new MedplumClient({ fetch });
      let numPages = 0;
      for await (const page of client.searchResourcePages('Patient', '_count=2')) {
        expect(page).toHaveLength(numPages === 0 ? 2 : 1);
        expect(page[0].resourceType).toBe('Patient');
        numPages += 1;
      }
      expect(numPages).toBe(2);
    });

    test('Search resources pages with offset', async () => {
      const client = new MedplumClient({ fetch });
      let numPages = 0;
      for await (const page of client.searchResourcePages('Patient', { _count: '2', _offset: '1' })) {
        expect(page).toHaveLength(2);
        expect(page[0].resourceType).toBe('Patient');
        numPages += 1;
      }

      expect(numPages).toBe(1);
    });

    test('Search resources pages with cache', async () => {
      const client = new MedplumClient({ fetch });
      let numPages = 0;
      // Populate the cache
      await client.search('Patient', '_count=1');

      // Iterate through pages
      for await (const page of client.searchResourcePages('Patient', '_count=1')) {
        expect(page).toHaveLength(1);
        expect(page[0].resourceType).toBe('Patient');
        numPages += 1;
      }

      expect(numPages).toBe(3);
    });
  });

  test('Search ValueSet', async () => {
    const fetch = mockFetch(200, { resourceType: 'ValueSet' });
    const client = new MedplumClient({ fetch });
    const result = await client.searchValueSet('system', 'filter');
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('ValueSet');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.medplum.com/fhir/R4/ValueSet/$expand'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('ValueSet $expand', async () => {
    const fetch = mockFetch(200, { resourceType: 'ValueSet' });
    const client = new MedplumClient({ fetch });
    const result = await client.valueSetExpand({ url: 'system', filter: 'filter', count: 20 });
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('ValueSet');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.medplum.com/fhir/R4/ValueSet/$expand'),
      expect.objectContaining({ method: 'GET' })
    );

    const url = new URL(fetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('url')).toBe('system');
    expect(url.searchParams.get('filter')).toBe('filter');
    expect(url.searchParams.get('count')).toBe('20');
  });

  describe('Batch', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:61ebe359-bfdc-4613-8bf2-c5e300945f0a',
          resource: {
            resourceType: 'Patient',
            name: [{ use: 'official', given: ['Alice'], family: 'Smith' }],
            gender: 'female',
            birthDate: '1974-12-25',
          },
          request: {
            method: 'POST',
            url: 'Patient',
          },
        },
        {
          fullUrl: 'urn:uuid:88f151c0-a954-468a-88bd-5ae15c08e059',
          resource: {
            resourceType: 'Patient',
            identifier: [{ system: 'http:/example.org/fhir/ids', value: '234234' }],
            name: [{ use: 'official', given: ['Bob'], family: 'Jones' }],
            gender: 'male',
            birthDate: '1974-12-25',
          },
          request: {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=http:/example.org/fhir/ids|234234',
          },
        },
      ],
    };
    test('Execute batch', async () => {
      const fetch = mockFetch(200, {
        resourceType: 'Bundle',
        type: 'transaction-response',
      });
      const client = new MedplumClient({ fetch });
      const result = await client.executeBatch(bundle);
      expect(result).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.medplum.com/fhir/R4',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Accept: DEFAULT_ACCEPT,
            'Content-Type': ContentType.FHIR_JSON,
            'X-Medplum': 'extended',
          },
          body: expect.stringContaining('Bundle'),
        })
      );
    });

    test('Execute batch with options', async () => {
      const fetch = mockFetch(200, {
        resourceType: 'Bundle',
        type: 'transaction-response',
      });
      const signal = new AbortController().signal;
      const options: RequestInit = { headers: { 'X-Test': '123' }, signal };
      const client = new MedplumClient({ fetch });
      const result = await client.executeBatch(bundle, options);
      expect(result).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.medplum.com/fhir/R4',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': ContentType.FHIR_JSON,
            'X-Medplum': 'extended',
            ...options.headers,
          },
          body: expect.stringContaining('Bundle'),
        })
      );
    });
  });

  test('Send email', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.sendEmail({
      to: 'alice@example.com',
      subject: 'Test',
      text: 'Hello',
    });
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/email/v1/send',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.JSON,
          'X-Medplum': 'extended',
        },
        body: expect.stringContaining('alice@example.com'),
      })
    );
  });

  test('Push to agent', async () => {
    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    const result = await client.pushToAgent(
      { resourceType: 'Agent', id: '123' },
      { resourceType: 'Device', id: '456' },
      'XYZ',
      ContentType.HL7_V2
    );
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Agent/123/$push',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.FHIR_JSON,
          'X-Medplum': 'extended',
        },
        body: expect.stringMatching(/.+"destination":".+"body":"XYZ","contentType":"x-application\/hl7-v2\+er7".+/),
      })
    );
  });

  test('Storage events', async () => {
    // Make window.location writeable
    Object.defineProperty(window, 'location', {
      value: { assign: {} },
      writable: true,
    });

    const mockAddEventListener = jest.fn();
    const mockReload = jest.fn();

    window.addEventListener = mockAddEventListener;
    window.location.reload = mockReload;

    const fetch = mockFetch(200, {});
    const client = new MedplumClient({ fetch });
    expect(client).toBeDefined();
    expect(mockAddEventListener).toHaveBeenCalled();
    expect(mockAddEventListener.mock.calls[0][0]).toBe('storage');

    const callback = mockAddEventListener.mock.calls[0][1];

    mockReload.mockReset();
    callback({ key: 'randomKey' });
    expect(mockReload).not.toHaveBeenCalled();

    mockReload.mockReset();
    callback({ key: 'activeLogin' });
    expect(mockReload).toHaveBeenCalled();

    mockReload.mockReset();
    callback({ key: null });
    expect(mockReload).toHaveBeenCalled();
  });

  test('setAccessToken', async () => {
    const patient: Patient = { resourceType: 'Patient', id: '123' };
    const fetch = jest.fn(async (url: string) => ({
      status: 200,
      headers: { get: () => ContentType.FHIR_JSON },
      json: async () => (url.endsWith('/auth/me') ? { profile: patient } : patient),
    }));

    const client = new MedplumClient({ fetch });
    const accessToken = createFakeJwt({ login_id: '123' });
    client.setAccessToken(accessToken);
    expect(client.getAccessToken()).toEqual(accessToken);

    await expect(client.readResource('Patient', '123')).resolves.toMatchObject(patient);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as any[])[1].headers.Authorization).toBe(`Bearer ${accessToken}`);

    expect(client.getProfile()).toBeUndefined();
    await expect(client.getProfileAsync()).resolves.toMatchObject(patient);
    const expectedCalls = fetch.mock.calls.length;
    await expect(client.getProfileAsync()).resolves.toMatchObject(patient);
    expect(fetch.mock.calls).toHaveLength(expectedCalls);
  });

  test('Client created with accessToken option set', async () => {
    const patient: Patient = { resourceType: 'Patient', id: '123' };
    const fetch = jest.fn(async (url: string) => ({
      status: 200,
      headers: { get: () => ContentType.FHIR_JSON },
      json: async () => (url.endsWith('/auth/me') ? { profile: patient } : patient),
    }));

    const accessToken = createFakeJwt({ login_id: '123' });
    const client = new MedplumClient({ fetch, accessToken });
    expect(client.getAccessToken()).toEqual(accessToken);

    await expect(client.readResource('Patient', '123')).resolves.toMatchObject(patient);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as any[])[1].headers.Authorization).toBe(`Bearer ${accessToken}`);

    expect(client.getProfile()).toBeUndefined();
    await expect(client.getProfileAsync()).resolves.toMatchObject(patient);
    const expectedCalls = fetch.mock.calls.length;
    await expect(client.getProfileAsync()).resolves.toMatchObject(patient);
    expect(fetch.mock.calls).toHaveLength(expectedCalls);
  });

  test('graphql', async () => {
    const fetch = mockFetch(200, {});
    const medplum = new MedplumClient({ fetch });
    const result = await medplum.graphql(`{
    Patient(id: "123") {
      resourceType
      id
      name {
        given
        family
      }
    }
  }`);
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/$graphql',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: DEFAULT_ACCEPT,
          'Content-Type': ContentType.JSON,
          'X-Medplum': 'extended',
        },
        body: expect.stringContaining('Patient'),
      })
    );
  });

  test('graphql variables', async () => {
    const fetch = mockFetch(200, {});
    const medplum = new MedplumClient({ fetch });
    const result = await medplum.graphql(
      `query GetPatientById($patientId: ID!) {
      Patient(id: $patientId) {
        resourceType
        id
        name {
          given
          family
        }
      }
    }`,
      'GetPatientById',
      { patientId: '123' }
    );
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/$graphql',
      expect.objectContaining({
        body: expect.stringContaining('GetPatientById'),
      })
    );
  });

  test('Auto batch single request', async () => {
    const medplum = new MedplumClient({ fetch: mockFetch(200, { resourceType: 'Patient' }), autoBatchTime: 100 });
    const patient = await medplum.readResource('Patient', '123');
    expect(patient).toBeDefined();
  });

  test('Auto batch single request error', async () => {
    const fetch = mockFetch(404, notFound);
    const medplum = new MedplumClient({ fetch, autoBatchTime: 100 });

    try {
      await medplum.readResource('Patient', 'xyz-not-found');
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome).toMatchObject(notFound);
    }
  });

  test('Auto batch multiple requests', async () => {
    const medplum = new MedplumClient({
      fetch: mockFetch(200, {
        resourceType: 'Bundle',
        entry: [
          {
            response: { status: '200' },
            resource: { resourceType: 'Patient' },
          },
          {
            response: { status: '200' },
            resource: { resourceType: 'Practitioner' },
          },
        ],
      }),
      autoBatchTime: 100,
    });

    // Start two requests at the same time
    const patientPromise = medplum.readResource('Patient', '123');
    const practitionerPromise = medplum.readResource('Practitioner', '123');

    // Wait for the batch to be sent
    const patient = await patientPromise;
    const practitioner = await practitionerPromise;

    expect(patient).toBeDefined();
    expect(practitioner).toBeDefined();
  });

  test('Auto batch error', async () => {
    const medplum = new MedplumClient({
      fetch: mockFetch(200, {
        resourceType: 'Bundle',
        entry: [
          {
            response: { status: '200' },
            resource: { resourceType: 'Patient' },
          },
          {
            response: { status: '404', outcome: notFound },
          },
        ],
      }),
      autoBatchTime: 100,
    });
    try {
      // Start multiple requests to force a batch
      const patientPromise = medplum.readResource('Patient', '123');
      await medplum.readResource('Patient', '9999999-does-not-exist');
      await patientPromise;
      throw new Error('Expected error');
    } catch (err) {
      expect((err as OperationOutcomeError).outcome).toMatchObject(notFound);
    }
  });

  test('Retry on 500', async () => {
    let count = 0;

    const fetch = jest.fn(async () => {
      if (count === 0) {
        count++;
        return { status: 500 };
      }
      return {
        status: 200,
        headers: { get: () => ContentType.FHIR_JSON },
        json: async () => ({ resourceType: 'Patient' }),
      };
    });

    const client = new MedplumClient({ fetch });
    const patient = await client.readResource('Patient', '123');
    expect(patient).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('Dispatch on bad connection', async () => {
    const fetch = jest.fn(async () => {
      throw new Error('Failed to fetch');
    });
    const mockDispatchEvent = jest.fn();
    const client = new MedplumClient({ fetch });
    client.dispatchEvent = mockDispatchEvent;
    try {
      await client.readResource('Patient', '123');
      fail('Expected error');
    } catch (err) {
      expect(mockDispatchEvent).toHaveBeenCalled();
      expect(err).toBeDefined();
    }
  });

  test('Handle HL7 response', async () => {
    const fetch = jest.fn(async () => ({
      status: 200,
      headers: { get: () => ContentType.HL7_V2 },
      text: async () => 'MSH|^~\\&|1|\r\n',
    }));
    const client = new MedplumClient({ fetch });
    const response = await client.post('/$process-message', 'MSH|^~\\&|1|\r\n', ContentType.HL7_V2);
    expect(response).toBeDefined();
    expect(response).toEqual('MSH|^~\\&|1|\r\n');
  });

  test('Log non-JSON response', async () => {
    // Handle the ugly case where server returns JSON header but non-JSON body
    const fetch = jest.fn(async () => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => Promise.reject(new Error('Not JSON')),
    }));
    console.error = jest.fn();
    const client = new MedplumClient({ fetch });
    try {
      await client.readResource('Patient', '123');
      fail('Expected error');
    } catch (err) {
      expect(err).toBeDefined();
    }
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  describe('Bulk Data Export', () => {
    let fetch: any;

    beforeEach(() => {
      let count = 0;
      fetch = jest.fn(async (url) => {
        if (url.includes('/$export?_since=200')) {
          return mockFetchResponse(200, accepted('bulkdata/id/status'), { 'content-location': 'bulkdata/id/status' });
        }

        if (url.includes('/$export')) {
          return mockFetchResponse(202, accepted('bulkdata/id/status'), { 'content-location': 'bulkdata/id/status' });
        }

        if (url.includes('bulkdata/id/status')) {
          if (count < 1) {
            count++;
            return mockFetchResponse(202, {});
          }
        }

        return mockFetchResponse(200, {
          transactionTime: '2023-05-18T22:55:31.280Z',
          request: 'https://api.medplum.com/fhir/R4/$export?_type=Observation',
          requiresAccessToken: false,
          output: [
            {
              type: 'ProjectMembership',
              url: 'https://api.medplum.com/storage/TEST',
            },
          ],
          error: [],
        });
      });
    });

    test('System Level', async () => {
      const medplum = new MedplumClient({ fetch });
      const response = await medplum.bulkExport(undefined, undefined, undefined, { pollStatusOnAccepted: true });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/$export'),
        expect.objectContaining({
          headers: {
            Accept: DEFAULT_ACCEPT,
            Prefer: 'respond-async',
            'X-Medplum': 'extended',
          },
        })
      );
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('bulkdata/id/status'), expect.any(Object));
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(response.output?.length).toBe(1);
    });

    test('with optional params type, since, options', async () => {
      const medplum = new MedplumClient({ fetch });
      const response = await medplum.bulkExport(undefined, 'Observation', 'testdate', {
        headers: { test: 'test' },
        pollStatusOnAccepted: true,
      });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/$export?_type=Observation&_since=testdate'),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('bulkdata/id/status'), expect.any(Object));
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(response.output?.length).toBe(1);
    });

    test('Group of Patients', async () => {
      const medplum = new MedplumClient({ fetch });
      const groupId = randomUUID();
      const response = await medplum.bulkExport(`Group/${groupId}`, undefined, undefined, {
        pollStatusOnAccepted: true,
      });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/Group/${groupId}/$export`), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('bulkdata/id/status'), expect.any(Object));
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(response.output?.length).toBe(1);
    });

    test('All Patient', async () => {
      const medplum = new MedplumClient({ fetch });
      const response = await medplum.bulkExport('Patient', undefined, undefined, { pollStatusOnAccepted: true });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/Patient/$export'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('bulkdata/id/status'), expect.any(Object));
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(response.output?.length).toBe(1);
    });

    test('Kick off missing content-location', async () => {
      const fetch = mockFetch(202, allOk);
      const medplum = new MedplumClient({ fetch });
      const response = await medplum.bulkExport();

      expect(response.output).not.toBeDefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('Failed Kickoff', async () => {
      const failFetch = jest.fn(async () => {
        return {
          status: 404,
          json: jest.fn(async () => {
            return notFound;
          }),
          headers: {
            get: jest.fn(),
          },
        };
      });
      const medplum = new MedplumClient({ fetch: failFetch });
      try {
        await medplum.bulkExport(`Patient`);
      } catch (err) {
        expect((err as Error).message).toBe('Not found');
      }
    });

    test('Poll after token refresh', async () => {
      const clientId = randomUUID();
      const clientSecret = randomUUID();
      const statusUrl = 'status-' + randomUUID();
      const locationUrl = 'location-' + randomUUID();

      const mockTokens = {
        access_token: createFakeJwt({ client_id: clientId, login_id: '123' }),
        refresh_token: createFakeJwt({ client_id: clientId }),
        profile: { reference: 'Patient/123' },
      };

      const mockMe = {
        project: { resourceType: 'Project', id: '123' },
        membership: { resourceType: 'ProjectMembership', id: '123' },
        profile: { resouceType: 'Practitioner', id: '123' },
        config: { resourceType: 'UserConfiguration', id: '123' },
        accessPolicy: { resourceType: 'AccessPolicy', id: '123' },
      };

      let count = 0;

      const mockFetch = async (url: string, options: any): Promise<any> => {
        count++;
        switch (count) {
          case 1:
            // First, handle the initial startClientLogin client credentials flow
            expect(options.method).toBe('POST');
            expect(url).toBe('https://api.medplum.com/oauth2/token');
            return mockFetchResponse(200, mockTokens);
          case 2:
            // MedplumClient will automatically fetch the user profile after token refresh
            expect(options.method).toBe('GET');
            expect(url).toBe('https://api.medplum.com/auth/me');
            return mockFetchResponse(200, mockMe);
          case 3:
            // Next, handle the initial bulk export - mock an expired token response
            expect(options.method).toBe('POST');
            expect(url).toBe('https://api.medplum.com/fhir/R4/$export');
            return mockFetchResponse(401, forbidden);
          case 4:
            // Now MedplumClient will try to automatically refresh the token
            expect(options.method).toBe('POST');
            expect(url).toBe('https://api.medplum.com/oauth2/token');
            return mockFetchResponse(200, mockTokens);
          case 5:
            // And then MedplumClient will automatically fetch the user profile again
            expect(options.method).toBe('GET');
            expect(url).toBe('https://api.medplum.com/auth/me');
            return mockFetchResponse(200, mockMe);
          case 6:
            // Ok, whew, we are refreshed, so we can finally get the bulk export
            // However, the bulk export isn't "done", so return "Accepted"
            expect(options.method).toBe('POST');
            expect(url).toBe('https://api.medplum.com/fhir/R4/$export');
            return mockFetchResponse(202, accepted(statusUrl));
          case 7:
            // Report status complete, and send the location of the bulk export
            expect(options.method).toBe('GET');
            expect(url).toBe('https://api.medplum.com/' + statusUrl);
            return mockFetchResponse(201, {}, { location: locationUrl });
          case 8:
            // What a journey! Finally, we can get the contents of the bulk export
            expect(options.method).toBe('GET');
            expect(url).toBe('https://api.medplum.com/' + locationUrl);
            return mockFetchResponse(200, { resourceType: 'Bundle' });
        }
        throw new Error('Unexpected fetch call: ' + url);
      };

      const medplum = new MedplumClient({ fetch: mockFetch });
      await medplum.startClientLogin(clientId, clientSecret);
      const result = await medplum.bulkExport(undefined, undefined, undefined, {
        pollStatusOnAccepted: true,
        followRedirectOnCreated: true,
      });
      expect(result).toMatchObject({ resourceType: 'Bundle' });
    });
  });

  describe('Downloading resources', () => {
    const baseUrl = 'https://api.medplum.com/';
    const fhirUrlPath = 'fhir/R4/';
    const accessToken = 'fake';
    let fetch: FetchLike;
    let client: MedplumClient;

    beforeAll(() => {
      fetch = mockFetch(200, (url: string) => ({
        text: () => Promise.resolve(url),
      }));
      client = new MedplumClient({ fetch, baseUrl, fhirUrlPath });
      client.setAccessToken(accessToken);
    });

    test('Downloading resources via URL', async () => {
      const blob = await client.download(baseUrl);
      expect(fetch).toHaveBeenCalledWith(
        baseUrl,
        expect.objectContaining({
          headers: {
            Accept: '*/*',
            Authorization: `Bearer ${accessToken}`,
            'X-Medplum': 'extended',
          },
        })
      );
      expect(await blob.text()).toEqual(baseUrl);
    });

    test('Downloading resources via `Binary/{id}` URL', async () => {
      const blob = await client.download('Binary/fake-id');
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}${fhirUrlPath}Binary/fake-id`,
        expect.objectContaining({
          headers: {
            Accept: '*/*',
            Authorization: `Bearer ${accessToken}`,
            'X-Medplum': 'extended',
          },
        })
      );
      expect(await blob.text()).toEqual(`${baseUrl}${fhirUrlPath}Binary/fake-id`);
    });
  });

  describe('Media', () => {
    test('Create Media', async () => {
      const fetch = mockFetch(200, {});
      fetch.mockImplementationOnce(async () => mockFetchResponse(201, { resourceType: 'Media', id: '123' }));
      fetch.mockImplementationOnce(async () =>
        mockFetchResponse(201, { resourceType: 'Binary', id: '456', url: 'Binary/456' })
      );
      fetch.mockImplementationOnce(async () => mockFetchResponse(200, { resourceType: 'Media', id: '123' }));

      const client = new MedplumClient({ fetch });
      const media = await client.createMedia({
        data: 'Hello world',
        contentType: 'text/plain',
        filename: 'hello.txt',
      });
      expect(media).toBeDefined();
      expect(fetch).toHaveBeenCalledTimes(3);

      const calls = fetch.mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][0]).toEqual('https://api.medplum.com/fhir/R4/Media');
      expect(calls[1][0]).toEqual('https://api.medplum.com/fhir/R4/Binary?_filename=hello.txt');
      expect(calls[2][0]).toEqual('https://api.medplum.com/fhir/R4/Media/123');
      expect(JSON.parse(calls[2][1].body)).toMatchObject({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: 'text/plain',
          url: 'Binary/456',
          title: 'hello.txt',
        },
      });
    });

    test('Upload Media', async () => {
      const fetch = mockFetch(200, {});
      fetch.mockImplementationOnce(async () => mockFetchResponse(201, { resourceType: 'Media', id: '123' }));
      fetch.mockImplementationOnce(async () =>
        mockFetchResponse(201, { resourceType: 'Binary', id: '456', url: 'Binary/456' })
      );
      fetch.mockImplementationOnce(async () => mockFetchResponse(200, { resourceType: 'Media', id: '123' }));

      const client = new MedplumClient({ fetch });
      const media = await client.uploadMedia('Hello world', 'text/plain', 'hello.txt');
      expect(media).toBeDefined();
      expect(fetch).toHaveBeenCalledTimes(3);

      const calls = fetch.mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][0]).toEqual('https://api.medplum.com/fhir/R4/Media');
      expect(calls[1][0]).toEqual('https://api.medplum.com/fhir/R4/Binary?_filename=hello.txt');
      expect(calls[2][0]).toEqual('https://api.medplum.com/fhir/R4/Media/123');
      expect(JSON.parse(calls[2][1].body)).toMatchObject({
        resourceType: 'Media',
        status: 'completed',
        content: {
          contentType: 'text/plain',
          url: 'Binary/456',
          title: 'hello.txt',
        },
      });
    });
  });

  describe('Prefer async', () => {
    test('Follow Content-Location', async () => {
      const fetch = jest.fn();

      // First time, return 202 Accepted with Content-Location
      fetch.mockImplementationOnce(async () =>
        mockFetchResponse(
          202,
          {},
          {
            'content-location': 'https://example.com/content-location/1',
          }
        )
      );

      // Second time, return 202 Accepted with Content-Location
      fetch.mockImplementationOnce(async () =>
        mockFetchResponse(
          202,
          {},
          {
            'content-location': 'https://example.com/content-location/1',
          }
        )
      );

      // Third time, return 201 Created with Location
      fetch.mockImplementationOnce(async () =>
        mockFetchResponse(201, {}, { location: 'https://example.com/location/1' })
      );

      // Fourth time, return 201 with JSON
      fetch.mockImplementationOnce(async () => mockFetchResponse(201, { resourceType: 'Patient' }));

      const client = new MedplumClient({ fetch });
      const response = await client.startAsyncRequest('/test', {
        method: 'POST',
        body: '{}',
        pollStatusOnAccepted: true,
        followRedirectOnCreated: true,
      });
      expect(fetch).toHaveBeenCalledTimes(4);
      expect((response as any).resourceType).toEqual('Patient');
    });
  });

  test('Verbose mode', async () => {
    const fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => ContentType.FHIR_JSON,
          forEach: (cb: (value: string, key: string) => void) => cb('bar', 'foo'),
        },
        json: () => Promise.resolve({ resourceType: 'Patient', id: '123' }),
      });
    });

    console.log = jest.fn();
    const client = new MedplumClient({ fetch, verbose: true });
    const result = await client.readResource('Patient', '123');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.medplum.com/fhir/R4/Patient/123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
    expect(console.log).toHaveBeenCalledWith('> GET https://api.medplum.com/fhir/R4/Patient/123');
    expect(console.log).toHaveBeenCalledWith('> Accept: application/fhir+json, */*; q=0.1');
    expect(console.log).toHaveBeenCalledWith('> X-Medplum: extended');
    expect(console.log).toHaveBeenCalledWith('< 200 OK');
    expect(console.log).toHaveBeenCalledWith('< foo: bar');
  });
});

describe('Passed in async-backed `ClientStorage`', () => {
  test('MedplumClient resolves initialized after storage is initialized', async () => {
    const fetch = mockFetch(200, { success: true });
    const storage = new MockAsyncClientStorage();
    const medplum = new MedplumClient({ fetch, storage });
    expect(storage.isInitialized).toEqual(false);
    expect(medplum.isInitialized).toEqual(false);
    storage.setInitialized();
    await medplum.getInitPromise();
    expect(storage.isInitialized).toEqual(true);
    expect(medplum.isInitialized).toEqual(true);
  });

  test('MedplumClient should resolve initialized when sync storage used', async () => {
    const fetch = mockFetch(200, { success: true });
    const medplum = new MedplumClient({ fetch });
    await expect(medplum.getInitPromise()).resolves.toBeUndefined();
  });

  test('MedplumClient emits `storageInitFailed` when storage.getInitPromise throws', async () => {
    const fetch = mockFetch(200, { success: true });
    class TestStorage extends MockAsyncClientStorage {
      reject!: (err: Error) => void;
      promise: Promise<void>;
      constructor() {
        super();
        this.promise = new Promise((_resolve, reject) => {
          this.reject = reject;
        });
      }
      getInitPromise(): Promise<void> {
        return this.promise;
      }
      rejectInitPromise(): void {
        this.reject(new Error('Storage init failed!'));
      }
    }

    const storage = new TestStorage();
    const medplum = new MedplumClient({ fetch, storage });
    const dispatchEventSpy = jest.spyOn(medplum, 'dispatchEvent');

    storage.rejectInitPromise();

    await expect(medplum.getInitPromise()).rejects.toThrow('Storage init failed!');
    expect(dispatchEventSpy).toHaveBeenCalledWith<[MedplumClientEventMap['storageInitFailed']]>({
      type: 'storageInitFailed',
      payload: { error: new Error('Storage init failed!') },
    });
  });
});

function createPdf(
  docDefinition: TDocumentDefinitions,
  tableLayouts?: Record<string, CustomTableLayout>,
  fonts?: TFontDictionary
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const printer = new PdfPrinter(fonts || {});
    const pdfDoc = printer.createPdfKitDocument(docDefinition, { tableLayouts });
    const chunks: Uint8Array[] = [];
    pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

function fail(message: string): never {
  throw new Error(message);
}

const fonts: TFontDictionary = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};
