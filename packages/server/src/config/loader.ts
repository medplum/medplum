import { splitN } from '@medplum/core';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { loadAwsConfig } from '../cloud/aws/config';
import { loadAzureConfig } from '../cloud/azure/config';
import { loadGcpConfig } from '../cloud/gcp/config';
import { MedplumServerConfig } from './types';
import { addDefaults, isBooleanConfig, isFloatConfig, isIntegerConfig, isObjectConfig, ServerConfig } from './utils';

let cachedConfig: ServerConfig | undefined = undefined;

/**
 * Returns the server configuration settings.
 * @returns The server configuration settings.
 */
export function getConfig(): ServerConfig {
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
  let config: MedplumServerConfig;
  switch (configType) {
    case 'env':
      config = loadEnvConfig();
      break;
    case 'file':
      config = await loadFileConfig(configPath);
      break;
    case 'aws':
      config = await loadAwsConfig(configPath);
      break;
    case 'gcp':
      config = await loadGcpConfig(configPath);
      break;
    case 'azure':
      config = await loadAzureConfig(configPath);
      break;
    default:
      throw new Error('Unrecognized config type: ' + configType);
  }

  if (!config.baseUrl || typeof config.baseUrl !== 'string' || config.baseUrl.trim() === '') {
    throw new Error('Missing required config setting: baseUrl. Please set "baseUrl" in your configuration.');
  }

  cachedConfig = addDefaults(config);
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
  config.database.disableRunPostDeployMigrations = true;
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

      if (key.startsWith('SSL')) {
        key = key.substring('SSL_'.length);
        currConfig = config.database.ssl = config.database.ssl ?? {};
      }

    } else if (key.startsWith('REDIS_')) {
      key = key.substring('REDIS_'.length);
      currConfig = config.redis = config.redis ?? {};
    } else if (key.startsWith('SMTP_')) {
      key = key.substring('SMTP_'.length);
      currConfig = config.smtp = config.smtp ?? {};
    }

    // Convert key from CAPITAL_CASE to camelCase
    key = key.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());

    if (isIntegerConfig(key)) {
      currConfig[key] = parseInt(value ?? '', 10);
    } else if (isFloatConfig(key)) {
      currConfig[key] = parseFloat(value ?? '');
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
  return JSON.parse(readFileSync(resolve(__dirname, '../../', path), { encoding: 'utf8' }));
}
