import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';

import { getConfig, loadConfig } from './config';

describe('Config', () => {
  beforeEach(() => {
    const secretsManagerMock = mockClient(SecretsManagerClient);
    secretsManagerMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({ host: 'host', port: 123 }),
    })

    const ssmMock = mockClient(SSMClient);
    ssmMock.on(GetParametersByPathCommand).resolves({
      Parameters: [
        { Name: 'baseUrl', Value: 'https://www.example.com/' },
        { Name: 'DatabaseSecrets', Value: 'DatabaseSecretsArn' },
        { Name: 'RedisSecrets', Value: 'RedisSecretsArn' },
        { Name: 'port', Value: '8080' },
        { Name: 'botCustomFunctionsEnabled', Value: 'true' },
        { Name: 'logAuditEvents', Value: 'true' },
        { Name: 'registerEnabled', Value: 'false' },
      ],
    })
  })

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
