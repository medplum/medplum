import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import fs from 'fs';
import 'aws-sdk-client-mock-jest';

import { getConfig, loadConfig } from './config';

describe('Config', () => {
  let mockSSMClient: AwsClientStub<SSMClient>;
  let mockSecretsManagerClient: AwsClientStub<SecretsManagerClient>;

  beforeEach(() => {
    mockSSMClient = mockClient(SSMClient);
    mockSecretsManagerClient = mockClient(SecretsManagerClient);

    mockSecretsManagerClient.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({ host: 'host', port: 123 }),
    });

    mockSSMClient.on(GetParametersByPathCommand).resolves({
      Parameters: [
        { Name: 'baseUrl', Value: 'https://www.example.com/' },
        { Name: 'DatabaseSecrets', Value: 'DatabaseSecretsArn' },
        { Name: 'RedisSecrets', Value: 'RedisSecretsArn' },
        { Name: 'port', Value: '8080' },
        { Name: 'botCustomFunctionsEnabled', Value: 'true' },
        { Name: 'logAuditEvents', Value: 'true' },
        { Name: 'registerEnabled', Value: 'false' },
      ],
    });
  });

  afterEach(() => {
    mockSSMClient.restore();
    mockSecretsManagerClient.restore();
  });

  test('Unrecognized config', async () => {
    await expect(loadConfig('unrecognized')).rejects.toThrow();
  });

  test('Load config file', async () => {
    const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');

    const config = await loadConfig('file:medplum.config.json');

    expect(readFileSyncSpy).toHaveBeenCalled();
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
    expect(mockSSMClient).toReceiveCommand(GetParametersByPathCommand);
  });

  test('Load region AWS config', async () => {
    const config = await loadConfig('aws:ap-southeast-2:test');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.port).toEqual(8080);
    expect(getConfig()).toBe(config);
    expect(mockSecretsManagerClient).toReceiveCommand(GetSecretValueCommand);
    expect(mockSecretsManagerClient).toReceiveCommandWith(GetSecretValueCommand, {
      SecretId: 'DatabaseSecretsArn',
    });
    expect(mockSecretsManagerClient).toReceiveCommandWith(GetSecretValueCommand, {
      SecretId: 'RedisSecretsArn',
    });
  });

  test('Load env config', async () => {
    process.env.MEDPLUM_BASE_URL = 'http://localhost:3000';
    process.env.MEDPLUM_PORT = '3000';
    process.env.MEDPLUM_DATABASE_PORT = '5432';
    const config = await loadConfig('env');
    expect(config).toBeDefined();
    expect(config.baseUrl).toEqual('http://localhost:3000');
    expect(config.port).toEqual(3000);
    expect(config.database.port).toEqual(5432);
    expect(getConfig()).toBe(config);
  });
});
