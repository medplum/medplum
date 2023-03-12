import { Bundle, BundleEntry, Patient, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import { webcrypto } from 'crypto';
import PdfPrinter from 'pdfmake';
import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { TextEncoder } from 'util';
import { MedplumClient, NewPatientRequest, NewProjectRequest, NewUserRequest } from './client';
import { getStatus, notFound, OperationOutcomeError } from './outcomes';
import { createReference, ProfileResource, stringify } from './utils';

const defaultOptions = {
  clientId: 'xyz',
  baseUrl: 'https://x/',
  fetch: mockFetch,
};

const patientStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
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

const emptyBundle: Bundle = {
  resourceType: 'Bundle',
  entry: [],
};

let canRefresh = true;
let tokenExpired = false;

function mockFetch(url: string, options: any): Promise<any> {
  const { method } = options;
  const response = mockHandler(method, url, options);
  response.status = response.status || 200;
  return Promise.resolve({
    ok: response.status === 200 || response.status === undefined,
    status: response.status,
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response),
  });
}

function mockHandler(method: string, url: string, options: any): any {
  let result: any;

  if (method === 'POST' && url.endsWith('auth/login')) {
    result = {
      login: '123',
      code: '123',
    };
  } else if (method === 'POST' && url.endsWith('auth/google')) {
    result = {
      login: '123',
      code: '123',
    };
  } else if (method === 'GET' && url.endsWith('auth/me')) {
    result = {
      profile: {
        resourceType: 'Practitioner',
        id: '123',
      },
      config: {
        resourceType: 'UserConfiguration',
        id: '123',
        menu: [
          {
            title: 'My Menu',
            link: [
              {
                name: 'My Link',
                target: '/my-target',
              },
            ],
          },
        ],
      },
    };
  } else if (method === 'GET' && url.endsWith('Practitioner/123')) {
    result = {
      resourceType: 'Practitioner',
      id: '123',
    };
  } else if (method === 'GET' && url.endsWith('Patient/123')) {
    result = {
      resourceType: 'Patient',
      id: '123',
    };
  } else if (method === 'GET' && url.endsWith('Patient')) {
    result = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
          },
        },
      ],
    };
  } else if (method === 'GET' && url.endsWith('Patient/not-found')) {
    result = { status: 404 };
  } else if (
    method === 'GET' &&
    (url.endsWith('Patient?_count=1&name:contains=alice') || url.endsWith('Patient?_count=1&name%3Acontains=alice'))
  ) {
    result = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
          },
        },
      ],
    };
  } else if (method === 'POST' && url.endsWith('oauth2/token')) {
    if (canRefresh) {
      let clientId = defaultOptions.clientId;
      if (options.body && options.body.get) {
        clientId = options.body.get('client_id') || defaultOptions.clientId;
      }
      result = {
        status: 200,
        access_token: 'header.' + window.btoa(stringify({ client_id: clientId })) + '.signature',
        refresh_token: 'header.' + window.btoa(stringify({ client_id: clientId })) + '.signature',
      };
    } else {
      result = {
        status: 400,
      };
    }
  } else if (method === 'GET' && url.includes('expired')) {
    if (tokenExpired) {
      result = {
        status: 401,
      };
      tokenExpired = false;
    } else {
      result = {
        ok: true,
      };
    }
  } else if (method === 'GET' && url.endsWith('/fhir/R4/StructureDefinition?_count=1&name:exact=')) {
    result = emptyBundle;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/StructureDefinition?_count=1&name:exact=DoesNotExist')) {
    result = emptyBundle;
  } else if (method === 'PUT' && url.endsWith('Patient/777')) {
    result = {
      status: 304, // Not modified
    };
  } else if (method === 'PUT' && url.endsWith('Patient/888')) {
    result = {
      status: 400,
      resourceType: 'OperationOutcome',
      id: 'bad-request',
    };
  } else if (method === 'GET' && url.endsWith('ValueSet/$expand?url=system&filter=filter')) {
    result = {
      resourceType: 'ValueSet',
    };
  } else if (method === 'POST' && url.endsWith('fhir/R4/$graphql')) {
    result = schemaResponse;
  } else if (method === 'POST' && url.endsWith('fhir/R4')) {
    result = mockFhirBatchHandler(method, url, options);
  } else if (method === 'POST' && options?.headers?.['Content-Type'] === 'application/fhir+json') {
    // Default "create" operation returns the body
    result = JSON.parse(options.body);
  } else {
    result = notFound;
  }

  return {
    request: {
      url,
      options,
    },
    ...result,
  };
}

function mockFhirBatchHandler(_method: string, _path: string, options: any): Bundle {
  const { body } = options;
  const request = JSON.parse(body) as Bundle;
  return {
    resourceType: 'Bundle',
    type: 'batch-response',
    entry: request.entry?.map((e: BundleEntry) => {
      const url = 'fhir/R4/' + e?.request?.url;
      const method = e?.request?.method as string;
      const resource = mockHandler(method, url, null);
      if (resource?.resourceType === 'OperationOutcome') {
        return { resource, response: { status: getStatus(resource).toString(), outcome: resource } };
      } else if (resource) {
        return { resource, response: { status: '200' } };
      } else {
        return { resource: notFound, response: { status: '404' } };
      }
    }),
  };
}

describe('Client', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global, 'crypto', {
      value: webcrypto,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    canRefresh = true;
    tokenExpired = false;
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
          fetch: mockFetch,
        })
    ).not.toThrow();

    expect(
      () =>
        new MedplumClient({
          fetch: mockFetch,
        })
    ).not.toThrow();

    window.fetch = jest.fn();
    expect(() => new MedplumClient()).not.toThrow();
  });

  test('Missing trailing slash', () => {
    const client = new MedplumClient({ clientId: 'xyz', baseUrl: 'https://x' });
    expect(client.getBaseUrl()).toBe('https://x/');
  });

  test('Restore from localStorage', async () => {
    window.localStorage.setItem(
      'activeLogin',
      JSON.stringify({
        accessToken: '123',
        refreshToken: '456',
        project: {
          reference: 'Project/123',
        },
        profile: {
          reference: 'Practitioner/123',
        },
      })
    );

    const client = new MedplumClient(defaultOptions);
    expect(client.getBaseUrl()).toEqual(defaultOptions.baseUrl);
    expect(client.isLoading()).toBe(true);
    expect(client.getProfile()).toBeUndefined();
    expect(client.getProfileAsync()).toBeDefined();
    expect(client.getUserConfiguration()).toBeUndefined();

    const profile = (await client.getProfileAsync()) as ProfileResource;
    expect(client.isLoading()).toBe(false);
    expect(profile.id).toBe('123');
    expect(client.getProfileAsync()).toBeDefined();
    expect(client.getUserConfiguration()).toBeDefined();
  });

  test('Clear', () => {
    const client = new MedplumClient(defaultOptions);
    expect(() => client.clear()).not.toThrow();
  });

  test('SignOut', () => {
    const client = new MedplumClient(defaultOptions);
    expect(() => client.signOut()).not.toThrow();
    expect(client.getActiveLogin()).toBeUndefined();
    expect(client.getProfile()).toBeUndefined();
  });

  test('SignIn direct', async () => {
    const client = new MedplumClient(defaultOptions);
    const result1 = await client.startLogin({ email: 'admin@example.com', password: 'admin' });
    expect(result1).toBeDefined();
    expect(result1.login).toBeDefined();
    expect(result1.code).toBeDefined();
  });

  test('Sign in with Google', async () => {
    const client = new MedplumClient(defaultOptions);
    const result1 = await client.startGoogleLogin({
      googleClientId: 'google-client-id',
      googleCredential: 'google-credential',
    });
    expect(result1).toBeDefined();
    expect(result1.login).toBeDefined();
  });

  test('SignInWithRedirect', async () => {
    // Mock window.location.assign
    global.window = Object.create(window);
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    const client = new MedplumClient(defaultOptions);

    // First, test the initial reidrect
    const result1 = await client.signInWithRedirect();
    expect(result1).toBeUndefined();
    expect(assign).toBeCalledWith(expect.stringMatching(/authorize\?.+scope=/));

    // Mock response code
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
        search: new URLSearchParams({ code: 'test-code' }),
      },
      writable: true,
    });

    // Next, test processing the response code
    const result2 = client.signInWithRedirect();
    expect(result2).toBeDefined();
  });

  test('SignOutWithRedirect', async () => {
    // Mock window.location.assign
    global.window = Object.create(window);
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
      },
      writable: true,
    });

    const client = new MedplumClient(defaultOptions);
    client.signOutWithRedirect();
    expect(window.location.assign).toBeCalled();
  });

  test('Sign in with external auth', async () => {
    global.window = Object.create(window);
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    const client = new MedplumClient(defaultOptions);
    const result = await client.signInWithExternalAuth(
      'https://auth.example.com/authorize',
      'external-client-123',
      'https://me.example.com',
      {
        clientId: 'medplum-client-123',
      }
    );
    expect(result).toBeUndefined();
    expect(assign).toBeCalledWith(expect.stringMatching(/authorize\?.+scope=/));
  });

  test('Get external auth redirect URI', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = client.getExternalAuthRedirectUri(
      'https://auth.example.com/authorize',
      'external-client-123',
      'https://me.example.com',
      {
        clientId: 'medplum-client-123',
      }
    );
    expect(result).toMatch(/https:\/\/auth\.example\.com\/authorize\?.+scope=/);
  });

  test('New project success', async () => {
    const client = new MedplumClient(defaultOptions);

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
    const client = new MedplumClient(defaultOptions);

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
    const client = new MedplumClient(defaultOptions);
    const result1 = await client.startClientLogin('test-client-id', 'test-client-secret');
    expect(result1).toBeDefined();

    tokenExpired = true;
    const result2 = await client.get('expired');
    expect(result2).toBeDefined();
  });

  test('HTTP GET', async () => {
    const client = new MedplumClient(defaultOptions);
    const request1 = client.get('Practitioner/123');
    const request2 = client.get('Practitioner/123');
    expect(request2).toBe(request1);

    const request3 = client.get('Practitioner/123', { cache: 'reload' });
    expect(request3).not.toBe(request1);
  });

  test('Read expired and refresh', async () => {
    tokenExpired = true;

    const client = new MedplumClient(defaultOptions);

    const loginResponse = await client.startLogin({ email: 'admin@example.com', password: 'admin' });
    await client.processCode(loginResponse.code as string);

    const result = await client.get('expired');
    expect(result).toBeDefined();
  });

  test('Read expired and refresh with unAuthenticated callback', async () => {
    tokenExpired = true;
    canRefresh = false;

    const onUnauthenticated = jest.fn();
    const client = new MedplumClient({ ...defaultOptions, onUnauthenticated });
    const loginResponse = await client.startLogin({ email: 'admin@example.com', password: 'admin' });
    await expect(client.processCode(loginResponse.code as string)).rejects.toThrow('Failed to fetch tokens');

    const result = client.get('expired');
    await expect(result).rejects.toThrow('Unauthenticated');
    expect(onUnauthenticated).toBeCalled();
  });

  test('Read resource', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.readResource('Patient', '123');
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
  });

  test('Read reference', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.readReference({ reference: 'Patient/123' });
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
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
    const client = new MedplumClient(defaultOptions);
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Nothing in the cache
    const readPromise = client.readResource('Patient', '123');
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Promise in the cache
    const result = await readPromise;
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
    expect(client.getCached('Patient', '123')).toBe(result); // Value in the cache
  });

  test('Read cached resource not found', async () => {
    expect.assertions(7);
    const client = new MedplumClient(defaultOptions);
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
    const client = new MedplumClient(defaultOptions);
    const reference = { reference: 'Patient/123' };
    expect(client.getCachedReference(reference)).toBeUndefined();
    const readPromise = client.readReference(reference);
    expect(client.getCachedReference(reference)).toBeUndefined(); // Promise in the cache
    const result = await readPromise;
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
    expect(client.getCachedReference(reference)).toBe(result);
    expect(client.getCachedReference({})).toBeUndefined();
    expect(client.getCachedReference({ reference: '' })).toBeUndefined();
    expect(client.getCachedReference({ reference: 'xyz' })).toBeUndefined();
    expect(client.getCachedReference({ reference: 'xyz?abc' })).toBeUndefined();
  });

  test('Disabled cache read cached resource', async () => {
    const client = new MedplumClient({ ...defaultOptions, cacheTime: 0 });
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Nothing in the cache
    const readPromise = client.readResource('Patient', '123');
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Cache is disabled
    const result = await readPromise;
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('123');
    expect(client.getCached('Patient', '123')).toBeUndefined(); // Cache is disabled
  });

  test('Read history', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.readHistory('Patient', '123');
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123/_history');
  });

  test('Read patient everything', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.readPatientEverything('123');
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123/$everything');
  });

  test('Create resource', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.createResource({ resourceType: 'Patient' });
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient');
  });

  test('Create resource missing resourceType', async () => {
    const client = new MedplumClient(defaultOptions);
    try {
      await client.createResource({} as Patient);
      fail('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Missing resourceType');
    }
  });

  test('Create resource if none exist returns existing', async () => {
    const client = new MedplumClient(defaultOptions);
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
    const client = new MedplumClient(defaultOptions);
    const result = await client.createResourceIfNoneExist<Patient>(
      {
        resourceType: 'Patient',
        name: [{ given: ['Bob'], family: 'Smith' }],
      },
      'name:contains=bob'
    );
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient');
  });

  test('Update resource', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.updateResource({ resourceType: 'Patient', id: '123' });
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('PUT');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  });

  test('Update resource validation', async () => {
    const client = new MedplumClient(defaultOptions);
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
    const client = new MedplumClient(defaultOptions);
    const result = await client.updateResource({ resourceType: 'Patient', id: '777' });
    expect(result).not.toBeUndefined();
    expect(result.resourceType).toBe('Patient');
    expect(result.id).toBe('777');
  });

  test('Bad Request', async () => {
    const client = new MedplumClient(defaultOptions);
    try {
      await client.updateResource({ resourceType: 'Patient', id: '888' });
      fail('Expected error');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('Create binary', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.createBinary('Hello world', undefined, 'text/plain');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Binary');
  });

  test('Create binary with filename', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.createBinary('Hello world', 'hello.txt', 'text/plain');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Binary?_filename=hello.txt');
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

    const client = new MedplumClient(defaultOptions);
    const promise = client.createBinary('Hello world', undefined, 'text/plain', onProgress);
    expect(xhrMock.open).toBeCalled();
    expect(xhrMock.setRequestHeader).toBeCalled();

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
    const client = new MedplumClient(defaultOptions);
    try {
      await client.createPdf({ content: ['Hello world'] });
    } catch (err) {
      expect((err as Error).message).toEqual('PDF creation not enabled');
    }
  });

  test('Create pdf success', async () => {
    const client = new MedplumClient({ ...defaultOptions, createPdf });
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
    expect((result as any).request.url).toBe('https://x/fhir/R4/Binary');
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.options.headers['Content-Type']).toBe('application/pdf');
    expect(footer).toHaveBeenCalled();
  });

  test('Create pdf with filename', async () => {
    const client = new MedplumClient({ ...defaultOptions, createPdf });
    const result = await client.createPdf(
      { content: ['Hello world'], defaultStyle: { font: 'Helvetica' } },
      'report.pdf',
      undefined,
      fonts
    );
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4/Binary?_filename=report.pdf');
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.options.headers['Content-Type']).toBe('application/pdf');
  });

  test('Create comment on Encounter', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.createComment({ resourceType: 'Encounter', id: '999' }, 'Hello world');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Communication');
    expect(result.basedOn).toBeDefined();
    expect(result.encounter).toBeDefined();
  });

  test('Create comment on ServiceRequest', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.createComment({ resourceType: 'ServiceRequest', id: '999' }, 'Hello world');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Communication');
    expect(result.basedOn).toBeDefined();
  });

  test('Create comment on Patient', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.createComment({ resourceType: 'Patient', id: '999' }, 'Hello world');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Communication');
    expect(result.basedOn).toBeDefined();
    expect(result.subject).toBeDefined();
  });

  test('Patch resource', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.patchResource('Patient', '123', [
      { op: 'replace', path: '/name/0/family', value: 'Doe' },
    ]);
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('PATCH');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  });

  test('Delete resource', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.deleteResource('Patient', 'xyz');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('DELETE');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/xyz');
  });

  test('Validate resource', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.validateResource({ resourceType: 'Patient' });
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/$validate');
  });

  test('Request schema', async () => {
    const client = new MedplumClient(defaultOptions);
    expect(client.getSchema()).toBeDefined();
    expect(client.getSchema().types['Patient']).toBeUndefined();
    const schema = await client.requestSchema('Patient');
    expect(schema).toBeDefined();
    expect(schema.types['Patient']).toBeDefined();
    expect(schema.types['Patient'].searchParams).toBeDefined();
  });

  test('Get cached schema', async () => {
    const client = new MedplumClient(defaultOptions);

    // Issue two requests simultaneously
    const request1 = client.requestSchema('Patient');
    const request2 = client.requestSchema('Patient');

    const schema1 = await request1;
    expect(schema1).toBeDefined();
    expect(schema1.types['Patient']).toBeDefined();

    const schema2 = await request2;
    expect(schema2).toBeDefined();
    expect(schema2).toEqual(schema1);

    const schema3 = await client.requestSchema('Patient');
    expect(schema3).toEqual(schema1);
  });

  test('Search', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.search('Patient', 'name:contains=alice');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('GET');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient?name%3Acontains=alice');
  });

  test('Search no filters', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.search('Patient');
    expect(result).toBeDefined();
    expect((result as any).request.options.method).toBe('GET');
    expect((result as any).request.url).toBe('https://x/fhir/R4/Patient');
  });

  test('Search one', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.searchOne('Patient', 'name:contains=alice');
    expect(result).toBeDefined();
    expect(result?.resourceType).toBe('Patient');
  });

  test('Search one ReadablePromise', async () => {
    const client = new MedplumClient(defaultOptions);
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
    const client = new MedplumClient(defaultOptions);
    const result = await client.searchResources('Patient', '_count=1&name:contains=alice');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].resourceType).toBe('Patient');
  });

  test('Search resources with record of params', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.searchResources('Patient', { _count: 1, 'name:contains': 'alice' });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].resourceType).toBe('Patient');
  });

  test('Search resources ReadablePromise', async () => {
    const client = new MedplumClient(defaultOptions);
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
    const client = new MedplumClient(defaultOptions);
    const result = await client.search('Patient');
    expect(result).toBeDefined();
    expect(client.getCachedReference(createReference(result.entry?.[0]?.resource as Patient))).toBeDefined();
  });

  test('Search ValueSet', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.searchValueSet('system', 'filter');
    expect(result).toBeDefined();
    expect(result.resourceType).toBe('ValueSet');
  });

  test('Execute batch', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.executeBatch({
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
    });
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/fhir/R4');
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.options.headers['Content-Type']).toBe('application/fhir+json');
  });

  test('Send email', async () => {
    const client = new MedplumClient(defaultOptions);
    const result = await client.sendEmail({
      to: 'alice@example.com',
      subject: 'Test',
      text: 'Hello',
    });
    expect(result).toBeDefined();
    expect((result as any).request.url).toBe('https://x/email/v1/send');
    expect((result as any).request.options.method).toBe('POST');
    expect((result as any).request.options.headers['Content-Type']).toBe('application/json');
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

    const client = new MedplumClient(defaultOptions);
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
    const fetch = jest.fn(async () => ({
      status: 200,
      json: async () => ({ resourceType: 'Patient' }),
    }));

    const client = new MedplumClient({ fetch });
    client.setAccessToken('foo');
    expect(client.getAccessToken()).toEqual('foo');

    const patient = await client.readResource('Patient', '123');
    expect(patient).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as any[])[1].headers.Authorization).toBe('Bearer foo');
  });
});

test('graphql', async () => {
  const medplum = new MedplumClient(defaultOptions);
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
  expect((result as any).request.url).toBe('https://x/fhir/R4/$graphql');
  expect((result as any).request.options.method).toBe('POST');
  expect((result as any).request.options.headers['Content-Type']).toBe('application/json');
});

test('graphql variables', async () => {
  const medplum = new MedplumClient(defaultOptions);
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
  expect((result as any).request.url).toBe('https://x/fhir/R4/$graphql');
  expect((result as any).request.options.method).toBe('POST');
  expect((result as any).request.options.headers['Content-Type']).toBe('application/json');

  const body = JSON.parse((result as any).request.options.body);
  expect(body.operationName).toBe('GetPatientById');
  expect(body.query).toBeDefined();
  expect(body.variables).toBeDefined();
});

test('Auto batch single request', async () => {
  const medplum = new MedplumClient({ ...defaultOptions, autoBatchTime: 100 });
  const patient = await medplum.readResource('Patient', '123');
  expect(patient).toBeDefined();
});

test('Auto batch multiple requests', async () => {
  const medplum = new MedplumClient({ ...defaultOptions, autoBatchTime: 100 });

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
  const medplum = new MedplumClient({ ...defaultOptions, autoBatchTime: 100 });
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
      json: async () => ({ resourceType: 'Patient' }),
    };
  });

  const client = new MedplumClient({ fetch });
  const patient = await client.readResource('Patient', '123');
  expect(patient).toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('Log non-JSON response', async () => {
  const fetch = jest.fn(async () => ({
    status: 200,
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

function createPdf(
  docDefinition: TDocumentDefinitions,
  tableLayouts?: { [name: string]: CustomTableLayout },
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
