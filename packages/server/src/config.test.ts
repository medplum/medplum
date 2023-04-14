import { getConfig, loadConfig } from './config';

jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('@aws-sdk/client-ssm');

describe('Config', () => {
  test('Unrecognized config', async () => {
    await expect(loadConfig('unrecognized')).rejects.toThrow();
  });

  test('Load config file', async () => {
    const config = await loadConfig('file:medplum.config.json');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(getConfig()).toBe(config);
  });

  test('Load AWS config', async () => {
    const config = await loadConfig('aws:test');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.port).toEqual(8080);
    expect(config.botCustomFunctionsEnabled).toEqual(true);
    expect(config.logAuditEvents).toEqual(true);
    expect(config.registerEnabled).toEqual(false);
    expect(getConfig()).toBe(config);
  });

  test('Load region AWS config', async () => {
    const config = await loadConfig('aws:ap-southeast-2:test');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.port).toEqual(8080);
    expect(getConfig()).toBe(config);
  });
});
