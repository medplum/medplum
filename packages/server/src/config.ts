import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { splitN } from '@medplum/core';
import { KeepJobs } from 'bullmq';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

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
  logLevel?: string;
  binaryStorage?: string;
  storageBaseUrl: string;
  signingKey: string;
  signingKeyId: string;
  signingKeyPassphrase: string;
  supportEmail: string;
  database: MedplumDatabaseConfig;
  redis: MedplumRedisConfig;
  smtp?: MedplumSmtpConfig;
  bullmq?: MedplumBullmqConfig;
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
  saveAuditEvents?: boolean;
  registerEnabled?: boolean;
  bcryptHashSalt: number;
  introspectionEnabled?: boolean;
  keepAliveTimeout?: number;
  vmContextBotsEnabled?: boolean;
  shutdownTimeoutMilliseconds?: number;
  heartbeatMilliseconds?: number;
  heartbeatEnabled?: boolean;

  /** @deprecated */
  auditEventLogGroup?: string;

  /** @deprecated */
  auditEventLogStream?: string;
}

/**
 * The SSL configuration for the database.
 */
export interface MedplumDatabaseSslConfig {
  ca?: string;
  key?: string;
  cert?: string;
  rejectUnauthorized?: boolean;
  require?: boolean;
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
  ssl?: MedplumDatabaseSslConfig;
}

export interface MedplumRedisConfig {
  host?: string;
  port?: number;
  password?: string;
  tls?: Record<string, unknown>;
}

export interface MedplumSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface MedplumBullmqConfig {
  /**
   * Amount of jobs that a single worker is allowed to work on in parallel.
   * @see {@link https://docs.bullmq.io/guide/workers/concurrency}
   */
  concurrency?: number;
  removeOnComplete: KeepJobs;
  removeOnFail: KeepJobs;
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
 * @param configName - The medplum config identifier.
 * @returns The loaded configuration.
 */
export async function loadConfig(configName: string): Promise<MedplumServerConfig> {
  const [configType, configPath] = splitN(configName, ':', 2);
  switch (configType) {
    case 'env':
      cachedConfig = loadEnvConfig();
      break;
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
  config.binaryStorage = 'file:' + mkdtempSync(join(tmpdir(), 'medplum-temp-storage'));
  config.allowedOrigins = undefined;
  config.database.host = process.env['POSTGRES_HOST'] ?? 'localhost';
  config.database.port = process.env['POSTGRES_PORT'] ? parseInt(process.env['POSTGRES_PORT'], 10) : 5432;
  config.database.dbname = 'medplum_test';
  return config;
}

/**
 * Loads configuration settings from environment variables.
 * Environment variables names are prefixed with "MEDPLUM_".
 * For example, "MEDPLUM_PORT" will set the "port" config setting.
 * @returns The configuration.
 */
function loadEnvConfig(): MedplumServerConfig {
  const config: Record<string, any> = {};
  // Iterate over all environment variables
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('MEDPLUM_')) {
      continue;
    }

    let key = name.substring('MEDPLUM_'.length);
    let currConfig = config;

    if (key.startsWith('DATABASE_')) {
      key = key.substring('DATABASE_'.length);
      currConfig = config.database = config.database ?? {};
    } else if (key.startsWith('REDIS_')) {
      key = key.substring('REDIS_'.length);
      currConfig = config.redis = config.redis ?? {};
    }

    // Convert key from CAPITAL_CASE to camelCase
    key = key.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());

    if (isIntegerConfig(key)) {
      currConfig.port = parseInt(value ?? '', 10);
    } else if (isBooleanConfig(key)) {
      currConfig[key] = value === 'true';
    } else if (isObjectConfig(key)) {
      currConfig[key] = JSON.parse(value ?? '');
    } else {
      currConfig[key] = value;
    }
  }

  return config as MedplumServerConfig;
}

/**
 * Loads configuration settings from a JSON file.
 * Path relative to the current working directory at runtime.
 * @param path - The config file path.
 * @returns The configuration.
 */
async function loadFileConfig(path: string): Promise<MedplumServerConfig> {
  return JSON.parse(readFileSync(resolve(__dirname, '../', path), { encoding: 'utf8' }));
}

/**
 * Loads configuration settings from AWS SSM Parameter Store.
 * @param path - The AWS SSM Parameter Store path prefix.
 * @returns The loaded configuration.
 */
async function loadAwsConfig(path: string): Promise<MedplumServerConfig> {
  let region = DEFAULT_AWS_REGION;
  if (path.includes(':')) {
    [region, path] = splitN(path, ':', 2);
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
    if (response.Parameters) {
      for (const param of response.Parameters) {
        const key = (param.Name as string).replace(path, '');
        const value = param.Value as string;
        if (key === 'DatabaseSecrets') {
          config['database'] = await loadAwsSecrets(region, value);
        } else if (key === 'RedisSecrets') {
          config['redis'] = await loadAwsSecrets(region, value);
        } else if (isIntegerConfig(key)) {
          config.port = parseInt(value, 10);
        } else if (isBooleanConfig(key)) {
          config[key] = value === 'true';
        } else {
          config[key] = value;
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);

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

/**
 * Adds default values to the config.
 * @param config - The input config as loaded from the config file.
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
  config.bullmq = { concurrency: 10, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 }, ...config.bullmq };
  config.shutdownTimeoutMilliseconds = config.shutdownTimeoutMilliseconds ?? 30000;
  return config;
}

function isIntegerConfig(key: string): boolean {
  return key === 'port';
}

function isBooleanConfig(key: string): boolean {
  return (
    key === 'botCustomFunctionsEnabled' ||
    key === 'logAuditEvents' ||
    key === 'registerEnabled' ||
    key === 'require' ||
    key === 'rejectUnauthorized'
  );
}

function isObjectConfig(key: string): boolean {
  return key === 'tls';
}
