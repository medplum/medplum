import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SSMClient } from '@aws-sdk/client-ssm';
import { getConfig, loadConfig } from './config';

jest.mock('@aws-sdk/client-secrets-manager');
jest.mock('@aws-sdk/client-ssm');

describe('Config', () => {
  beforeAll(() => {
    (SSMClient as unknown as jest.Mock).mockImplementation(() => {
      return {
        send: () => {
          return {
            Parameters: [
              { Name: 'baseUrl', Value: 'https://www.example.com/' },
              { Name: 'DatabaseSecrets', Value: 'DatabaseSecretsArn' },
              { Name: 'RedisSecrets', Value: 'RedisSecretsArn' },
            ],
          };
        },
      };
    });

    (SecretsManagerClient as unknown as jest.Mock).mockImplementation(() => {
      return {
        send: () => {
          return {
            SecretString: JSON.stringify({ host: 'host', port: 123 }),
          };
        },
      };
    });
  });

  beforeEach(() => {
    (SSMClient as unknown as jest.Mock).mockClear();
    (SecretsManagerClient as unknown as jest.Mock).mockClear();
  });

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
    expect(getConfig()).toBe(config);
  });
});
