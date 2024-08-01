import { splitN } from '@medplum/core';
import { KeepJobs } from 'bullmq';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { loadAwsConfig } from './cloud/aws/config';

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
  approvedSenderEmails?: string;
  database: MedplumDatabaseConfig;
  databaseProxyEndpoint?: string;
  readonlyDatabase?: MedplumDatabaseConfig;
  readonlyDatabaseProxyEndpoint?: string;
  redis: MedplumRedisConfig;
  emailProvider?: 'none' | 'awsses' | 'smtp';
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
  logRequests?: boolean;
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
  accurateCountThreshold: number;
  slowQueryThresholdMilliseconds?: number;
  defaultBotRuntimeVersion: 'awslambda' | 'vmcontext';
  defaultProjectFeatures?:
    | (
        | 'email'
        | 'bots'
        | 'cron'
        | 'google-auth-required'
        | 'graphql-introspection'
        | 'terminology'
        | 'websocket-subscriptions'
      )[]
    | undefined;
  defaultRateLimit?: number;
  defaultAuthRateLimit?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when creating a FHIR Resource */
  maxBotLogLengthForResource?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when logging to logger */
  maxBotLogLengthForLogs?: number;

  /** Temporary feature flag, to be removed */
  chainedSearchWithReferenceTables?: boolean;

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
  queryTimeout?: number;
  runMigrations?: boolean;
}

export interface MedplumRedisConfig {
  host?: string;
  port?: number;
  password?: string;
  /** The logical database to use for Redis. See: https://redis.io/commands/select/. Default is `0`. */
  db?: number;
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
  config.database.port = process.env['POSTGRES_PORT'] ? Number.parseInt(process.env['POSTGRES_PORT'], 10) : 5432;
  config.database.dbname = 'medplum_test';
  config.database.runMigrations = false;
  config.readonlyDatabase = {
    ...config.database,
    username: 'medplum_test_readonly',
    password: 'medplum_test_readonly',
  };
  config.redis.db = 7; // Select logical DB `7` so we don't collide with existing dev Redis cache.
  config.redis.password = process.env['REDIS_PASSWORD_DISABLED_IN_TESTS'] ? undefined : config.redis.password;
  config.approvedSenderEmails = 'no-reply@example.com';
  config.emailProvider = 'none';
  config.logLevel = 'error';
  config.defaultRateLimit = -1; // Disable rate limiter by default in tests

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
      currConfig[key] = parseInt(value ?? '', 10);
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
  config.accurateCountThreshold = config.accurateCountThreshold ?? 1000000;
  config.defaultBotRuntimeVersion = config.defaultBotRuntimeVersion ?? 'awslambda';
  config.defaultProjectFeatures = config.defaultProjectFeatures ?? [];
  config.emailProvider = config.emailProvider || (config.smtp ? 'smtp' : 'awsses');
  return config;
}

function isIntegerConfig(key: string): boolean {
  return key === 'port' || key === 'accurateCountThreshold';
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
  return key === 'tls' || key === 'ssl';
}
