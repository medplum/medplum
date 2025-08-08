// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { getConfig, loadConfig } from '../../config/loader';

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
        { Name: 'database.ssl.require', Value: 'true' },
        { Name: 'database.ssl.rejectUnauthorized', Value: 'true' },
        { Name: 'database.ssl.ca', Value: 'DatabaseSslCa' },
        { Name: 'DatabaseSecrets', Value: 'DatabaseSecretsArn' },
        { Name: 'RedisSecrets', Value: 'RedisSecretsArn' },
        { Name: 'port', Value: '8080' },
        { Name: 'botCustomFunctionsEnabled', Value: 'true' },
        { Name: 'logAuditEvents', Value: 'true' },
        { Name: 'registerEnabled', Value: 'false' },
        {
          Name: 'defaultProjectSystemSetting',
          Value: '[{"name":"someSetting","valueString":"someValue"},{"name":"secondSetting","valueInteger":5}]',
        },
      ],
    });
  });

  afterEach(() => {
    mockSSMClient.restore();
    mockSecretsManagerClient.restore();
  });

  test('Load AWS config', async () => {
    const config = await loadConfig('aws:test');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.port).toStrictEqual(8080);
    expect(config.botCustomFunctionsEnabled).toStrictEqual(true);
    expect(config.logAuditEvents).toStrictEqual(true);
    expect(config.registerEnabled).toStrictEqual(false);
    expect(config.defaultProjectSystemSetting).toStrictEqual([
      { name: 'someSetting', valueString: 'someValue' },
      { name: 'secondSetting', valueInteger: 5 },
    ]);
    expect(config.database).toBeDefined();
    expect(config.database.ssl).toBeDefined();
    expect(config.database.ssl?.require).toStrictEqual(true);
    expect(config.database.ssl?.rejectUnauthorized).toStrictEqual(true);
    expect(config.database.ssl?.ca).toStrictEqual('DatabaseSslCa');
    expect(getConfig()).toBe(config);
    expect(mockSSMClient).toReceiveCommand(GetParametersByPathCommand);
  });

  test('Load region AWS config', async () => {
    const config = await loadConfig('aws:ap-southeast-2:test');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.port).toStrictEqual(8080);
    expect(getConfig()).toBe(config);
    expect(mockSecretsManagerClient).toReceiveCommand(GetSecretValueCommand);
    expect(mockSecretsManagerClient).toReceiveCommandWith(GetSecretValueCommand, {
      SecretId: 'DatabaseSecretsArn',
    });
    expect(mockSecretsManagerClient).toReceiveCommandWith(GetSecretValueCommand, {
      SecretId: 'RedisSecretsArn',
    });
  });
});
