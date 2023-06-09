import { createMedplumClient, MedplumClientCommandOptions } from './client';

jest.mock('node-fetch');

describe('createMedplumClient', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
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
    const options: MedplumClientCommandOptions = {
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
    const accessToken =
      'header.' + Buffer.from(JSON.stringify({ cid: 'testclientid' })).toString('base64') + '.signature';

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
    const medplumClient = await createMedplumClient({ fetch });

    expect(medplumClient.getAccessToken()).toBeDefined();
  });
});
