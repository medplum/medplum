import { randomBytes } from 'crypto';
import { TextEncoder } from 'util';
import { MedplumClient } from './client';
import { Bundle, SearchParameter, StructureDefinition } from './fhir';
import { stringify } from './utils';

const defaultOptions = {
  clientId: 'xyz',
  baseUrl: 'https://x/',
  fetch: mockFetch
}

const patientStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  name: 'Patient',
  snapshot: {
    element: [
      {
        path: 'Patient.id',
        type: [{
          code: 'code'
        }]
      }
    ]
  }
};

const patientStructureDefinitionBundle: Bundle<StructureDefinition> = {
  resourceType: 'Bundle',
  entry: [{ resource: patientStructureDefinition }]
};

const patientSearchParameter: SearchParameter = {
  resourceType: 'SearchParameter',
  id: 'Patient-name',
  code: 'name',
  name: 'name',
  expression: 'Patient.name'
};

const patientSearchParameterBundle: Bundle<SearchParameter> = {
  resourceType: 'Bundle',
  entry: [{ resource: patientSearchParameter }]
};

let canRefresh = true;
let tokenExpired = false;

function mockFetch(url: string, options: any): Promise<any> {
  const { method } = options;

  let result: any;

  if (method === 'POST' && url.endsWith('auth/login')) {
    result = {
      profile: { resourceType: 'Practitioner', id: '123' },
      accessToken: '123',
      refreshToken: '456'
    };

  } else if (method === 'GET' && url.endsWith('Patient/123')) {
    result = {
      resourceType: 'Patient',
      id: '123'
    };

  } else if (method === 'POST' && url.endsWith('oauth2/token')) {
    if (canRefresh) {
      result = {
        access_token: 'header.' + window.btoa(stringify({ client_id: defaultOptions.clientId })) + '.signature',
        refresh_token: 'header.' + window.btoa(stringify({ client_id: defaultOptions.clientId })) + '.signature'
      };
    } else {
      result = {
        status: 400
      };
    }

  } else if (method === 'GET' && url.includes('expired')) {
    if (tokenExpired) {
      result = {
        status: 401
      };
      tokenExpired = false;
    } else {
      result = {
        ok: true
      };
    }

  } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Patient')) {
    result = patientStructureDefinitionBundle;

  } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?_count=100&base=Patient')) {
    result = patientSearchParameterBundle;

  } else if (method === 'PUT' && url.endsWith('Patient/777')) {
    result = {
      status: 304 // Not modified
    };

  } else if (method === 'PUT' && url.endsWith('Patient/888')) {
    result = {
      status: 400,
      resourceType: 'OperationOutcome',
      id: 'bad-request'
    };
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    ok: response.status === undefined,
    status: response.status,
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

test('Client constructor', () => {
  expect(() => new MedplumClient({
    clientId: '',
    baseUrl: 'https://example.com/',
  })).toThrow('Client ID cannot be empty');

  expect(() => new MedplumClient({
    clientId: 'xyz',
    baseUrl: 'x',
  })).toThrow('Base URL must start with http or https');

  expect(() => new MedplumClient({
    clientId: 'xyz',
    baseUrl: 'https://x',
  })).toThrow('Base URL must end with a trailing slash');

  expect(() => new MedplumClient({
    clientId: 'xyz',
    baseUrl: 'https://x/',
  })).toThrow();

  expect(() => new MedplumClient({
    clientId: 'xyz',
    baseUrl: 'https://x/',
    fetch: mockFetch
  })).not.toThrow();
});

test('Client clear', () => {
  const client = new MedplumClient(defaultOptions);
  expect(() => client.clear()).not.toThrow();
});

test('Client signOut', () => {
  const client = new MedplumClient(defaultOptions);
  expect(() => client.signOut()).not.toThrow();
});

test('Client signIn', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  expect(result).not.toBeUndefined();
  expect(result.resourceType).toBe('Practitioner');
});

test('Client signInWithRedirect', async () => {
  // Mock window.crypto
  Object.defineProperty(global.self, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => randomBytes(arr.length),
      subtle: {
        digest: () => 'test'
      }
    }
  });

  // Mock TextEncoder
  global.TextEncoder = TextEncoder;

  // Mock window.location.assign
  global.window = Object.create(window);
  Object.defineProperty(window, 'location', {
    value: {
      assign: jest.fn()
    },
    writable: true,
  });

  const client = new MedplumClient(defaultOptions);

  // First, test the initial reidrect
  const result1 = client.signInWithRedirect();
  expect(result1).toBeUndefined();

  // Mock response code
  Object.defineProperty(window, 'location', {
    value: {
      assign: jest.fn(),
      search: new URLSearchParams({ code: 'test-code' })
    },
    writable: true,
  });

  // Next, test processing the response code
  const result2 = client.signInWithRedirect();
  expect(result2).not.toBeUndefined();
});

test('Client signOutWithRedirect', async () => {
  // Mock window.location.assign
  global.window = Object.create(window);
  Object.defineProperty(window, 'location', {
    value: {
      assign: jest.fn()
    },
    writable: true,
  });

  const client = new MedplumClient(defaultOptions);
  client.signOutWithRedirect();
  expect(window.location.assign).toBeCalled();
});

test('Client read expired and refresh', async () => {
  tokenExpired = true;

  const client = new MedplumClient(defaultOptions);
  const result = await client.get('expired');
  expect(result).not.toBeUndefined();
});

test('Client read expired and refresh with unAuthenticated callback', async () => {
  tokenExpired = true;
  canRefresh = false;

  const onUnauthenticated = jest.fn();
  const client = new MedplumClient({ ...defaultOptions, onUnauthenticated });
  const result = client.get('expired');
  await expect(result).rejects.toEqual('Failed to fetch tokens');
  expect(onUnauthenticated).toBeCalled();
});

test('Client read resource', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.read('Patient', '123');
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  expect(result.resourceType).toBe('Patient');
  expect(result.id).toBe('123');
});

test('Client read reference', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.readReference({ reference: 'Patient/123' });
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  expect(result.resourceType).toBe('Patient');
  expect(result.id).toBe('123');
});

test('Client read empty reference', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = client.readReference({});
  expect(result).rejects.toEqual('Missing reference');
});

test('Client read cached resource', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.readCached('Patient', '123');
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  expect(result.resourceType).toBe('Patient');
  expect(result.id).toBe('123');
});

test('Client read cached reference', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.readCachedReference({ reference: 'Patient/123' });
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  expect(result.resourceType).toBe('Patient');
  expect(result.id).toBe('123');
});

test('Client read cached empty reference', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = client.readCachedReference({});
  expect(result).rejects.toEqual('Missing reference');
});

test('Client read history', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.readHistory('Patient', '123');
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123/_history');
});

test('Client read patient everything', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.readPatientEverything('123');
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123/%24everything');
});

test('Client create resource', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.create({ resourceType: 'Patient' });
  expect(result).not.toBeUndefined();
  expect((result as any).request.options.method).toBe('POST');
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient');
});

test('Client update resource', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.update({ resourceType: 'Patient', id: '123' });
  expect(result).not.toBeUndefined();
  expect((result as any).request.options.method).toBe('PUT');
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
});

test('Not modified', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.update({ resourceType: 'Patient', id: '777' });
  expect(result).toBeUndefined();
});

test('Bad Request', async () => {
  const client = new MedplumClient(defaultOptions);
  const promise = client.update({ resourceType: 'Patient', id: '888' });
  expect(promise).rejects.toMatchObject({});
});

test('Client read binary', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.readBinary('123');
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Binary/123');
});

test('Client create binary', async () => {
  const client = new MedplumClient(defaultOptions);
  const result = await client.createBinary('Hello world', 'text/plain');
  expect(result).not.toBeUndefined();
  expect((result as any).request.options.method).toBe('POST');
  expect((result as any).request.url).toBe('https://x/fhir/R4/Binary');
});

test('Client get schema', async () => {
  const client = new MedplumClient(defaultOptions);
  const schema = await client.getTypeDefinition('Patient');
  expect(schema).not.toBeUndefined();
  expect(schema.types['Patient']).not.toBeUndefined();
  expect(schema.types['Patient'].searchParams).not.toBeUndefined();
});
