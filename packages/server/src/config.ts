import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const AWS_REGION = 'us-east-1';

export interface MedplumServerConfig {
  baseUrl: string;
  issuer: string;
  jwksUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  binaryStorage: string;
  database: MedplumDatabaseConfig;
}

export interface MedplumDatabaseConfig {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

/**
 * AWS Secrets Manager for databases.
 * See: https://docs.aws.amazon.com/secretsmanager/latest/userguide/secretsmanager-userguide.pdf
 */
interface AwsDatabaseSecrets {
  engine: 'postgres';
  dbname: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

let cachedConfig: MedplumServerConfig | undefined = undefined;

/**
 * Returns the server configuration settings.
 * @returns The server configuration settings.
 */
export function getConfig(): MedplumServerConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded');
  }
  return cachedConfig;
}

/**
 * Loads configuration settings from a config identifier.
 * The identifier must start with one of the following prefixes:
 *   1) "file:" string followed by relative path.
 *   2) "aws:" followed by AWS SSM path prefix.
 * @param configName The medplum config identifier.
 * @returns The loaded configuration.
 */
export async function loadConfig(configName: string): Promise<MedplumServerConfig> {
  const [configType, configPath] = configName.split(':', 2);
  switch (configType) {
    case 'file':
      cachedConfig = await loadFileConfig(configPath);
      break;
    case 'aws':
      cachedConfig = await loadAwsConfig(configPath);
      break;
    case 'prod': // TODO: Remove legacy support
      cachedConfig = await loadAwsConfig('/medplum/prod/');
      break;
    default:
      throw new Error('Unrecognized config type: ' + configType);
  }
  return cachedConfig;
}

/**
 * Loads the configuration setting for unit and integration tests.
 * @returns The configuration for tests.
 */
export async function loadTestConfig(): Promise<MedplumServerConfig> {
  const config = await loadConfig('file:medplum.config.json');
  return {
    ...config,
    database: {
      ...config.database,
      host: process.env['POSTGRES_HOST'] ?? 'localhost',
      port: process.env['POSTGRES_PORT'] ? parseInt(process.env['POSTGRES_PORT']) : 5432,
      database: 'medplum_test'
    }
  };
}

/**
 * Loads configuration settings from a JSON file.
 * Path relative to the current working directory at runtime.
 * @param path The config file path.
 * @returns The configuration.
 */
async function loadFileConfig(path: string): Promise<MedplumServerConfig> {
  return JSON.parse(readFileSync(resolve(__dirname, '../', path), { encoding: 'utf8' }));
}

/**
 * Loads configuration settings from AWS SSM Parameter Store.
 * @param path The AWS SSM Parameter Store path prefix.
 * @returns The loaded configuration.
 */
async function loadAwsConfig(path: string): Promise<MedplumServerConfig> {
  const client = new SSMClient({ region: AWS_REGION });
  const config: Record<string, any> = {};

  let nextToken: string | undefined;
  do {
    const response = await client.send(new GetParametersByPathCommand({ Path: path, NextToken: nextToken }));
    if (response?.Parameters) {
      for (const param of response.Parameters) {
        const key = (param.Name as string).replace(path, '');
        const value = param.Value as string;
        if (key === 'DatabaseSecrets') {
          config['database'] = await loadAwsSecrets(value);
        } else {
          config[key] = value;
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return (config as unknown) as MedplumServerConfig;
}

/**
 * Returns the AWS Secret data as a JSON map.
 * @param secretId Secret ARN
 * @returns The secret data as a JSON map.
 */
async function loadAwsSecrets(secretId: string): Promise<MedplumDatabaseConfig> {
  const client = new SecretsManagerClient({
    region: AWS_REGION
  });

  const result = await client.send(new GetSecretValueCommand({
    SecretId: secretId
  }));

  if (!result.SecretString) {
    throw new Error('Missing secret data');
  }

  const secrets = JSON.parse(result.SecretString) as AwsDatabaseSecrets;
  return {
    host: secrets.host,
    database: secrets.dbname,
    port: secrets.port,
    username: secrets.username,
    password: secrets.password
  };
}
