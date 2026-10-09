// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
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
        { Name: 'requireVerifiedEmailForProjectCreation', Value: 'false' },
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
    expect(config.requireVerifiedEmailForProjectCreation).toStrictEqual(false);
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
    expect(mockSSMClient.commandCalls(GetParametersByPathCommand).length).toBeGreaterThan(0);
  });

  test('Load region AWS config', async () => {
    const config = await loadConfig('aws:ap-southeast-2:test');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.port).toStrictEqual(8080);
    expect(getConfig()).toBe(config);
    expect(mockSecretsManagerClient.commandCalls(GetSecretValueCommand).length).toBeGreaterThan(0);
    expect(
      mockSecretsManagerClient.commandCalls(GetSecretValueCommand, {
        SecretId: 'DatabaseSecretsArn',
      })
    ).toHaveLength(1);
    expect(
      mockSecretsManagerClient.commandCalls(GetSecretValueCommand, {
        SecretId: 'RedisSecretsArn',
      })
    ).toHaveLength(1);
  });

  test('Loads shard database secrets and typed shard parameters', async () => {
    mockSSMClient.on(GetParametersByPathCommand).resolves({
      Parameters: [
        { Name: 'baseUrl', Value: 'https://www.example.com/' },
        { Name: 'shards.shard-1.DatabaseSecrets', Value: 'ShardDatabaseSecretsArn' },
        { Name: 'shards.shard-1.ReaderDatabaseSecrets', Value: 'ShardReaderSecretsArn' },
        { Name: 'shards.shard-1.isDefaultShard', Value: 'false' },
        { Name: 'shards.shard-1.database.ssl.require', Value: 'true' },
      ],
    });
    mockSecretsManagerClient
      .on(GetSecretValueCommand, { SecretId: 'ShardDatabaseSecretsArn' })
      .resolves({ SecretString: JSON.stringify({ host: 'writer', dbname: 'medplum', port: 5432 }) })
      .on(GetSecretValueCommand, { SecretId: 'ShardReaderSecretsArn' })
      .resolves({ SecretString: JSON.stringify({ host: 'reader', dbname: 'medplum', port: 5432 }) });

    const config = await loadConfig('aws:test');
    const shard = config.shards?.['shard-1'];
    assert(shard);
    expect(shard.isDefaultShard).toBe(false);
    expect(shard.database).toStrictEqual({ host: 'writer', dbname: 'medplum', port: 5432, ssl: { require: true } });
    expect(shard.readonlyDatabase).toStrictEqual({ host: 'reader', dbname: 'medplum', port: 5432 });
    expect(shard.id).toBe('shard-1');
  });

  test('Rejects shard secrets with a malformed shard ID', async () => {
    mockSSMClient.on(GetParametersByPathCommand).resolves({
      Parameters: [
        { Name: 'baseUrl', Value: 'https://www.example.com/' },
        { Name: 'shards.Shard_1.DatabaseSecrets', Value: 'ShardDatabaseSecretsArn' },
      ],
    });
    await expect(loadConfig('aws:test')).rejects.toThrow(
      'Invalid shard ID in parameter shards.Shard_1.DatabaseSecrets'
    );
    expect(mockSecretsManagerClient.commandCalls(GetSecretValueCommand)).toHaveLength(0);
  });
});
