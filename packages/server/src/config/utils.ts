// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { concatUrls } from '@medplum/core';
import { MedplumServerConfig } from './types';

const DEFAULT_AWS_REGION = 'us-east-1';

export type ServerConfig = MedplumServerConfig & Required<Pick<MedplumServerConfig, DefaultConfigKeys>>;

/**
 * Adds default values to the config.
 * @param config - The input config as loaded from the config file.
 * @returns The config with default values added.
 */
export function addDefaults(config: MedplumServerConfig): ServerConfig {
  config.port ||= 8103;
  config.issuer ||= config.baseUrl;
  config.jwksUrl ||= concatUrls(config.baseUrl, '/.well-known/jwks.json');
  config.authorizeUrl ||= concatUrls(config.baseUrl, '/oauth2/authorize');
  config.tokenUrl ||= concatUrls(config.baseUrl, '/oauth2/token');
  config.userInfoUrl ||= concatUrls(config.baseUrl, '/oauth2/userinfo');
  config.introspectUrl ||= concatUrls(config.baseUrl, '/oauth2/introspect');
  config.registerUrl ||= concatUrls(config.baseUrl, '/oauth2/register');
  config.storageBaseUrl ||= concatUrls(config.baseUrl, '/storage');
  config.maxJsonSize ||= '1mb';
  config.maxBatchSize ||= '50mb';
  config.awsRegion ||= DEFAULT_AWS_REGION;
  config.botLambdaLayerName ||= 'medplum-bot-layer';
  config.bcryptHashSalt ||= 10;
  config.bullmq = { concurrency: 20, removeOnComplete: { count: 1 }, removeOnFail: { count: 1 }, ...config.bullmq };
  config.shutdownTimeoutMilliseconds ??= 30_000;
  config.accurateCountThreshold ??= 1_000_000;
  config.defaultBotRuntimeVersion ??= 'awslambda';
  config.defaultProjectFeatures ??= [];
  config.defaultProjectSystemSetting ??= [];
  config.emailProvider ||= config.smtp ? 'smtp' : 'awsses';
  config.autoDownloadEnabled ??= true;

  // History:
  // Before, the default "auth rate limit" was 600 per 15 minutes, but used "MemoryStore" rather than "RedisStore"
  // That meant that the rate limit was per server instance, rather than per server cluster
  // The value was primarily tuned for one particular cluster with 6 server instances
  // Therefore, to maintain parity, the new default "auth rate limit" is 1200 per 15 minutes
  config.defaultRateLimit ??= 60_000;
  config.defaultAuthRateLimit ??= 160;

  config.defaultFhirQuota ??= 50_000;
  return config as ServerConfig;
}

type DefaultConfigKeys =
  | 'port'
  | 'issuer'
  | 'jwksUrl'
  | 'authorizeUrl'
  | 'tokenUrl'
  | 'userInfoUrl'
  | 'introspectUrl'
  | 'storageBaseUrl'
  | 'maxJsonSize'
  | 'maxBatchSize'
  | 'awsRegion'
  | 'botLambdaLayerName'
  | 'bcryptHashSalt'
  | 'bullmq'
  | 'shutdownTimeoutMilliseconds'
  | 'accurateCountThreshold'
  | 'defaultBotRuntimeVersion'
  | 'defaultProjectFeatures'
  | 'defaultProjectSystemSetting'
  | 'emailProvider'
  | 'defaultRateLimit'
  | 'defaultAuthRateLimit'
  | 'defaultFhirQuota';

const integerKeys = [
  'accurateCountThreshold',
  'bcryptHashSalt',
  'defaultAuthRateLimit',
  'defaultFhirQuota',
  'defaultRateLimit',
  'heartbeatMilliseconds',
  'keepAliveTimeout',
  'maxBotLogLengthForLogs',
  'maxBotLogLengthForResource',
  'maxSearchOffset',
  'port',
  'shutdownTimeoutMilliseconds',
  'transactionAttempts',
  'transactionExpBackoffBaseDelayMs',

  'database.maxConnections',
  'database.port',
  'database.queryTimeout',
  'readonlyDatabase.maxConnections',
  'readonlyDatabase.port',
  'readonlyDatabase.queryTimeout',

  'redis.db',
  'redis.port',

  'smtp.port',

  'bullmq.concurrency',

  'fission.routerPort',
];

export function isIntegerConfig(key: string): boolean {
  return integerKeys.includes(key);
}

export function isFloatConfig(_key: string): boolean {
  return false;
}

const booleanKeys = [
  'botCustomFunctionsEnabled',
  'database.ssl.rejectUnauthorized',
  'database.ssl.require',
  'database.disableConnectionConfiguration',
  'database.disableRunPostDeployMigrations',
  'database.runMigrations',
  'readonlyDatabase.ssl.rejectUnauthorized',
  'readonlyDatabase.ssl.require',
  'readonlyDatabase.disableConnectionConfiguration',
  'logRequests',
  'logAuditEvents',
  'mcpEnabled',
  'registerEnabled',
  'require',
  'rejectUnauthorized',
];

export function isBooleanConfig(key: string): boolean {
  return booleanKeys.includes(key);
}

export function isObjectConfig(key: string): boolean {
  return key === 'tls' || key === 'ssl' || key === 'defaultProjectSystemSetting' || key === 'defaultOAuthClients';
}
