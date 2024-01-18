import { ContentType, allOk, append } from '@medplum/core';
import { RequestGroup } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  HealthGorillaConfig,
  assertNotEmpty,
  checkAbn,
  connectToHealthGorilla,
  ensureSubscriptions,
  getHealthGorillaConfig,
} from './utils';

const testConfig: HealthGorillaConfig = {
  baseUrl: 'https://example.com',
  audienceUrl: 'https://example.com',
  clientId: '123',
  clientSecret: '123',
  clientUri: 'https://example.com',
  userLogin: '123',
  tenantId: '123',
  subtenantId: '123',
  subtenantAccountNumber: '123',
  scopes: '123',
  callbackBotId: '123',
  callbackClientId: '123',
  callbackClientSecret: '123',
};

describe('Health Gorilla utils', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('getHealthGorillaConfig success', () => {
    process.env.HEALTH_GORILLA_BASE_URL = 'https://example.com';
    process.env.HEALTH_GORILLA_AUDIENCE_URL = 'https://example.com';
    process.env.HEALTH_GORILLA_CLIENT_ID = '123';
    process.env.HEALTH_GORILLA_CLIENT_SECRET = '123';
    process.env.HEALTH_GORILLA_CLIENT_URI = 'https://example.com';
    process.env.HEALTH_GORILLA_USER_LOGIN = '123';
    process.env.HEALTH_GORILLA_TENANT_ID = '123';
    process.env.HEALTH_GORILLA_SUBTENANT_ID = '123';
    process.env.HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER = '123';
    process.env.HEALTH_GORILLA_SCOPES = '123';
    process.env.HEALTH_GORILLA_CALLBACK_BOT_ID = '123';
    process.env.HEALTH_GORILLA_CALLBACK_CLIENT_ID = '123';
    process.env.HEALTH_GORILLA_CALLBACK_CLIENT_SECRET = '123';

    const result = getHealthGorillaConfig();
    expect(result).toMatchObject(testConfig);
  });

  test('getHealthGorillaConfig missing', () => {
    expect(() => getHealthGorillaConfig()).toThrow('Missing required environment variable: HEALTH_GORILLA_BASE_URL');
  });

  test('connectToHealthGorilla', () => {
    const fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => Promise.resolve({ access_token: 'foo' }),
    }));
    const client = connectToHealthGorilla(testConfig, { fetch });
    expect(client).toBeDefined();
  });

  test('ensureSubscriptions', async () => {
    const client = new MockClient();
    const logMock = (console.log = jest.fn());

    // First time
    await ensureSubscriptions(testConfig, client);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Created new subscription for "RequestGroup"'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Created new subscription for "ServiceRequest"'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Created new subscription for "DiagnosticReport"'));
    logMock.mockClear();

    // Second time
    await ensureSubscriptions(testConfig, client);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Subscription for "RequestGroup" already exists'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Subscription for "ServiceRequest" already exists'));
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Subscription for "DiagnosticReport" already exists'));
  });

  test('assertNotEmpty', () => {
    expect(() => assertNotEmpty(undefined, 'foo')).toThrow('foo');
    expect(() => assertNotEmpty(null, 'foo')).toThrow('foo');
    expect(() => assertNotEmpty('', 'foo')).toThrow('foo');
    expect(() => assertNotEmpty('x', 'foo')).not.toThrow('foo');
    expect(() => assertNotEmpty({}, 'foo')).not.toThrow('foo');
    expect(() => assertNotEmpty([], 'foo')).not.toThrow('foo');
  });

  test('checkAbn', async () => {
    const medplum = new MockClient();
    const healthGorilla = new MockClient();
    const requestGroup = await healthGorilla.createResource<RequestGroup>({
      resourceType: 'RequestGroup',
    } as RequestGroup);

    healthGorilla.router.router.add('GET', 'RequestGroup/:id/$abn', async () => {
      return [allOk, { resourceType: 'Parameters', parameter: [{ name: 'url', valueString: 'https://example.com' }] }];
    });

    const downloadSpy = jest.spyOn(healthGorilla, 'download').mockImplementationOnce(async () => new Blob([]));

    const logMock = (console.log = jest.fn());

    await checkAbn(medplum, healthGorilla, requestGroup as RequestGroup & { id: string });

    expect(downloadSpy).toHaveBeenCalledWith('https://example.com', { headers: { Accept: 'application/pdf' } });
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Uploaded ABN PDF as media'));
  });

  test('append', () => {
    expect(append(undefined, 'foo')).toEqual(['foo']);
    expect(append([], 'foo')).toEqual(['foo']);
    expect(append(['bar'], 'foo')).toEqual(['bar', 'foo']);
  });
});
