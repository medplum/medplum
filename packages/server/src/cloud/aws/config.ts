import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, Parameter, SSMClient } from '@aws-sdk/client-ssm';
import { splitN } from '@medplum/core';
import { MedplumServerConfig } from '../../config';

const DEFAULT_AWS_REGION = 'us-east-1';

/**
 * Loads configuration settings from AWS SSM Parameter Store.
 * @param path - The AWS SSM Parameter Store path prefix.
 * @returns The loaded configuration.
 */
export async function loadAwsConfig(path: string): Promise<MedplumServerConfig> {
  let region = DEFAULT_AWS_REGION;
  if (path.includes(':')) {
    [region, path] = splitN(path, ':', 2);
  }

  const client = new SSMClient({ region });
  const config: Record<string, any> = {};
  const parameters = [] as Parameter[];
  let nextToken: string | undefined;
  do {
    const response = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        NextToken: nextToken,
        WithDecryption: true,
      })
    );
    if (response.Parameters) {
      parameters.push(...response.Parameters);
    }
    nextToken = response.NextToken;
  } while (nextToken);

  // Load special AWS Secrets Manager secrets first
  for (const param of parameters) {
    const key = (param.Name as string).replace(path, '');
    const value = param.Value as string;
    if (key === 'DatabaseSecrets') {
      config['database'] = await loadAwsSecrets(region, value);
    } else if (key === 'ReaderDatabaseSecrets') {
      config['readonlyDatabase'] = await loadAwsSecrets(region, value);
    } else if (key === 'RedisSecrets') {
      config['redis'] = await loadAwsSecrets(region, value);
    }
  }

  // Then load other parameters, which may override the secrets
  for (const param of parameters) {
    const key = (param.Name as string).replace(path, '');
    const value = param.Value as string;
    setValue(config, key, value);
  }

  return config as MedplumServerConfig;
}

/**
 * Returns the AWS Database Secret data as a JSON map.
 * @param region - The AWS region.
 * @param secretId - Secret ARN
 * @returns The secret data as a JSON map.
 */
async function loadAwsSecrets(region: string, secretId: string): Promise<Record<string, any> | undefined> {
  const client = new SecretsManagerClient({ region });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (!result.SecretString) {
    return undefined;
  }

  return JSON.parse(result.SecretString);
}

function setValue(config: Record<string, unknown>, key: string, value: string): void {
  const keySegments = key.split('.');
  let obj = config;

  while (keySegments.length > 1) {
    const segment = keySegments.shift() as string;
    if (!obj[segment]) {
      obj[segment] = {};
    }
    obj = obj[segment] as Record<string, unknown>;
  }

  let parsedValue: any = value;
  if (isIntegerConfig(key)) {
    parsedValue = parseInt(value, 10);
  } else if (isBooleanConfig(key)) {
    parsedValue = value === 'true';
  } else if (isObjectConfig(key)) {
    parsedValue = JSON.parse(value);
  }

  obj[keySegments[0]] = parsedValue;
}

function isIntegerConfig(key: string): boolean {
  return key === 'port' || key === 'accurateCountThreshold' || key === 'slowQueryThresholdMilliseconds';
}

function isBooleanConfig(key: string): boolean {
  return (
    key === 'botCustomFunctionsEnabled' ||
    key === 'database.ssl.rejectUnauthorized' ||
    key === 'database.ssl.require' ||
    key === 'logRequests' ||
    key === 'logAuditEvents' ||
    key === 'registerEnabled' ||
    key === 'require' ||
    key === 'rejectUnauthorized'
  );
}

function isObjectConfig(key: string): boolean {
  return key === 'tls';
}
