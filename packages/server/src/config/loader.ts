// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { splitN } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAwsConfig } from '../cloud/aws/config';
import { loadAzureConfig } from '../cloud/azure/config';
import { loadGcpConfig } from '../cloud/gcp/config';
import type { MedplumServerConfig } from './types';
import type { ServerConfig } from './utils';
import { addDefaults, isBooleanConfig, isFloatConfig, isIntegerConfig, isObjectConfig } from './utils';

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
 * Loads configuration settings from one or more config identifiers.
 * Multiple sources can be combined by separating them with commas.
 * Sources are loaded left-to-right and deep-merged, so later sources override earlier ones.
 *
 * Each identifier must start with one of the following prefixes:
 *   1) "file:" string followed by relative path.
 *   2) "aws:" followed by AWS SSM path prefix.
 *   3) "gcp:" followed by GCP project.
 *   4) "azure:" followed by Azure vault.
 *   5) "env" to load from environment variables.
 *
 * Examples:
 *   - "file:medplum.config.json" — single file source
 *   - "aws:/medplum/prod/,env" — AWS SSM config with env var overrides
 *
 * @param configName - The medplum config identifier (comma-separated for multiple sources).
 * @returns The loaded configuration.
 */
export async function loadConfig(configName: string): Promise<MedplumServerConfig> {
  const segments = configName.split(',').filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error('Empty config name');
  }

  let config = await loadSingleConfig(segments[0]);
  for (let i = 1; i < segments.length; i++) {
    const overlay = await loadSingleConfig(segments[i]);
    config = deepMerge(
      config as unknown as Record<string, unknown>,
      overlay as unknown as Record<string, unknown>
    ) as unknown as MedplumServerConfig;
  }

  if (!config.baseUrl || typeof config.baseUrl !== 'string' || config.baseUrl.trim() === '') {
    throw new Error('Missing required config setting: baseUrl. Please set "baseUrl" in your configuration.');
  }

  cachedConfig = addDefaults(config);
  return cachedConfig;
}

/**
 * Loads configuration settings from a single config identifier.
 * @param configName - The config identifier (e.g. "file:path", "aws:path", "env").
 * @returns The loaded configuration.
 */
async function loadSingleConfig(configName: string): Promise<MedplumServerConfig> {
  const [configType, configPath] = splitN(configName, ':', 2);
  switch (configType) {
    case 'env':
      return loadEnvConfig();
    case 'file':
      return loadFileConfig(configPath);
    case 'aws':
      return loadAwsConfig(configPath);
    case 'gcp':
      return loadGcpConfig(configPath);
    case 'azure':
      return loadAzureConfig(configPath);
    default:
      throw new Error('Unrecognized config type: ' + configType);
  }
}

/**
 * Deep-merges two objects. Objects merge recursively, arrays replace wholesale, primitives overwrite.
 * @param base - The base object.
 * @param overlay - The overlay object whose values take precedence.
 * @returns A new merged object.
 */
function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseVal = base[key];
    const overlayVal = overlay[key];
    if (
      overlayVal !== null &&
      typeof overlayVal === 'object' &&
      !Array.isArray(overlayVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overlayVal as Record<string, unknown>);
    } else {
      result[key] = overlayVal;
    }
  }
  return result;
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
  // leave cacheRedis on the default DB
  config.rateLimitRedis = {
    ...config.redis,
    db: 8,
  };
  config.pubSubRedis = {
    ...config.redis,
    db: 9,
  };
  config.backgroundJobsRedis = {
    ...config.redis,
    db: 10,
  };
  config.approvedSenderEmails = 'no-reply@example.com';
  config.emailProvider = 'none';
  config.logLevel = 'error';
  config.defaultRateLimit = -1; // Disable rate limiter by default in tests
  config.defaultSuperAdminClientId = randomUUID();
  config.defaultSuperAdminClientSecret = randomUUID();
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
    let section = '';

    if (key.startsWith('DATABASE_')) {
      key = key.substring('DATABASE_'.length);
      currConfig = config.database ??= {};
      section = 'database';
    } else if (key.startsWith('CACHE_REDIS_')) {
      key = key.substring('CACHE_REDIS_'.length);
      currConfig = config.cacheRedis ??= {};
      section = 'cacheRedis';
    } else if (key.startsWith('RATE_LIMIT_REDIS_')) {
      key = key.substring('RATE_LIMIT_REDIS_'.length);
      currConfig = config.rateLimitRedis ??= {};
      section = 'rateLimitRedis';
    } else if (key.startsWith('PUBSUB_REDIS_')) {
      key = key.substring('PUBSUB_REDIS_'.length);
      currConfig = config.pubSubRedis ??= {};
      section = 'pubSubRedis';
    } else if (key.startsWith('BACKGROUND_JOBS_REDIS_')) {
      key = key.substring('BACKGROUND_JOBS_REDIS_'.length);
      currConfig = config.backgroundJobsRedis ??= {};
      section = 'backgroundJobsRedis';
    } else if (key.startsWith('REDIS_')) {
      key = key.substring('REDIS_'.length);
      currConfig = config.redis ??= {};
      section = 'redis';
    } else if (key.startsWith('SMTP_')) {
      key = key.substring('SMTP_'.length);
      currConfig = config.smtp ??= {};
      section = 'smtp';
    } else if (key.startsWith('BULLMQ_')) {
      key = key.substring('BULLMQ_'.length);
      currConfig = config.bullmq ??= {};
      section = 'bullmq';
    } else if (key.startsWith('FISSION_')) {
      key = key.substring('FISSION_'.length);
      currConfig = config.fission ??= {};
      section = 'fission';
    } else if (key.startsWith('WORKERS_')) {
      key = key.substring('WORKERS_'.length);
      currConfig = config.workers ??= {};
      section = 'workers';
    }

    // Convert key from CAPITAL_CASE to camelCase
    key = key.toLowerCase().replaceAll(/_([a-z])/g, (g) => g[1].toUpperCase());

    // Check both the dotted path (e.g. 'redis.db') and the leaf key (e.g. 'port')
    // so that nested keys registered with dotted paths and leaf-only keys both work
    const lookupKey = section ? `${section}.${key}` : key;

    if (isIntegerConfig(lookupKey) || isIntegerConfig(key)) {
      currConfig[key] = Number.parseInt(value ?? '', 10);
    } else if (isFloatConfig(lookupKey) || isFloatConfig(key)) {
      currConfig[key] = Number.parseFloat(value ?? '');
    } else if (isBooleanConfig(lookupKey) || isBooleanConfig(key)) {
      currConfig[key] = value === 'true';
    } else if (isObjectConfig(lookupKey) || isObjectConfig(key)) {
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
  return JSON.parse(readFileSync(path, { encoding: 'utf8' }));
}
