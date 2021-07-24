import { MedplumClient } from './client';

const defaultOptions = {
  clientId: 'xyz',
  baseUrl: 'https://x/',
  fetch: mockFetch
}

function mockFetch(url: string, options: any): Promise<any> {
  const { method } = options;

  const response: any = {
    request: {
      url,
      options
    }
  };

  if (method === 'POST' && url.endsWith('auth/login')) {
    response.user = { resourceType: 'User', id: '123' };
    response.accessToken = '123';
    response.refreshToken = '456';

  } else if (method === 'GET' && url.endsWith('Patient/123')) {
    response.resourceType = 'Patient';
    response.id = '123';
  }

  return Promise.resolve({
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
  })).toThrow('Cannot read property \'bind\' of undefined');

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
  expect(result.resourceType).toBe('User');
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
  const result = await client.readReference('Patient/123');
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  expect(result.resourceType).toBe('Patient');
  expect(result.id).toBe('123');
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
  const result = await client.readCachedReference('Patient/123');
  expect(result).not.toBeUndefined();
  expect((result as any).request.url).toBe('https://x/fhir/R4/Patient/123');
  expect(result.resourceType).toBe('Patient');
  expect(result.id).toBe('123');
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
