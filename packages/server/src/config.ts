import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_AWS_REGION = 'us-east-1';

export interface MedplumServerConfig {
  port: number;
  baseUrl: string;
  issuer: string;
  jwksUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  appBaseUrl: string;
  binaryStorage: string;
  storageBaseUrl: string;
  signingKey: string;
  signingKeyId: string;
  signingKeyPassphrase: string;
  supportEmail: string;
  database: MedplumDatabaseConfig;
  redis: MedplumRedisConfig;
  googleClientId?: string;
  googleClientSecret?: string;
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  maxJsonSize: string;
  allowedOrigins?: string;
  awsRegion: string;
  botLambdaRoleArn: string;
  botLambdaLayerName: string;
  botCustomFunctionsEnabled?: boolean;
  logAuditEvents?: boolean;
  auditEventLogGroup?: string;
  auditEventLogStream?: string;
  registerEnabled?: boolean;
  bcryptHashSalt: number;
  introspectionEnabled?: boolean;
}

/**
 * Based on AWS Secrets Manager for databases.
 * See: https://docs.aws.amazon.com/secretsmanager/latest/userguide/secretsmanager-userguide.pdf
 */
export interface MedplumDatabaseConfig {
  host?: string;
  port?: number;
  dbname?: string;
  username?: string;
  password?: string;
}

export interface MedplumRedisConfig {
  host?: string;
  port?: number;
  password?: string;
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
  const [configType, configPath] = splitOnce(configName, ':');
  switch (configType) {
    case 'file':
      cachedConfig = await loadFileConfig(configPath);
      break;
    case 'aws':
      cachedConfig = await loadAwsConfig(configPath);
      break;
    default:
      throw new Error('Unrecognized config type: ' + configType);
  }
  cachedConfig = addDefaults(cachedConfig);
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
    allowedOrigins: undefined,
    database: {
      ...config.database,
      host: process.env['POSTGRES_HOST'] ?? 'localhost',
      port: process.env['POSTGRES_PORT'] ? parseInt(process.env['POSTGRES_PORT']) : 5432,
      dbname: 'medplum_test',
    },
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
  let region = DEFAULT_AWS_REGION;
  if (path.includes(':')) {
    [region, path] = splitOnce(path, ':');
  }

  const client = new SSMClient({ region });
  const config: Record<string, any> = {};

  let nextToken: string | undefined;
  do {
    const response = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        NextToken: nextToken,
        WithDecryption: true,
      })
    );
    if (response?.Parameters) {
      for (const param of response.Parameters) {
        const key = (param.Name as string).replace(path, '');
        const value = param.Value as string;
        if (key === 'DatabaseSecrets') {
          config['database'] = await loadAwsSecrets(region, value);
        } else if (key === 'RedisSecrets') {
          config['redis'] = await loadAwsSecrets(region, value);
        } else if (key === 'port') {
          config.port = parseInt(value);
        } else if (key === 'botCustomFunctionsEnabled' || key === 'logAuditEvents' || key === 'registerEnabled') {
          config[key] = value === 'true';
        } else {
          config[key] = value;
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return config as unknown as MedplumServerConfig;
}

/**
 * Returns the AWS Database Secret data as a JSON map.
 * @param region The AWS region.
 * @param secretId Secret ARN
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

/**
 * Adds default values to the config.
 * @param config The input config as loaded from the config file.
 * @returns The config with default values added.
 */
function addDefaults(config: MedplumServerConfig): MedplumServerConfig {
  config.port = config.port || 8103;
  config.issuer = config.issuer || config.baseUrl;
  config.jwksUrl = config.jwksUrl || config.baseUrl + '/.well-known/jwks.json';
  config.authorizeUrl = config.authorizeUrl || config.baseUrl + '/authorize';
  config.tokenUrl = config.tokenUrl || config.baseUrl + '/token';
  config.userInfoUrl = config.userInfoUrl || config.baseUrl + '/userinfo';
  config.storageBaseUrl = config.storageBaseUrl || config.baseUrl + '/storage';
  config.maxJsonSize = config.maxJsonSize || '1mb';
  config.awsRegion = config.awsRegion || DEFAULT_AWS_REGION;
  config.botLambdaLayerName = config.botLambdaLayerName || 'medplum-bot-layer';
  config.bcryptHashSalt = config.bcryptHashSalt || 10;
  return config;
}

function splitOnce(value: string, delimiter: string): [string, string] {
  const index = value.indexOf(delimiter);
  return [value.substring(0, index), value.substring(index + 1)];
}
