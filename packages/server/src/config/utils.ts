import { concatUrls } from '@medplum/core';
import { MedplumServerConfig } from './types';

const DEFAULT_AWS_REGION = 'us-east-1';

/**
 * Adds default values to the config.
 * @param config - The input config as loaded from the config file.
 * @returns The config with default values added.
 */
export function addDefaults(config: MedplumServerConfig): MedplumServerConfig {
  config.port = config.port || 8103;
  config.issuer = config.issuer || config.baseUrl;
  config.jwksUrl = config.jwksUrl || concatUrls(config.baseUrl, '/.well-known/jwks.json');
  config.authorizeUrl = config.authorizeUrl || concatUrls(config.baseUrl, '/oauth2/authorize');
  config.tokenUrl = config.tokenUrl || concatUrls(config.baseUrl, '/oauth2/token');
  config.userInfoUrl = config.userInfoUrl || concatUrls(config.baseUrl, '/oauth2/userinfo');
  config.storageBaseUrl = config.storageBaseUrl || concatUrls(config.baseUrl, '/storage');
  config.maxJsonSize = config.maxJsonSize || '1mb';
  config.maxBatchSize = config.maxBatchSize || '50mb';
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

const integerKeys = ['port', 'accurateCountThreshold'];

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
  'readonlyDatabase.ssl.rejectUnauthorized',
  'readonlyDatabase.ssl.require',
  'readonlyDatabase.disableConnectionConfiguration',
  'logRequests',
  'logAuditEvents',
  'registerEnabled',
  'require',
  'rejectUnauthorized',
];

export function isBooleanConfig(key: string): boolean {
  return booleanKeys.includes(key);
}

export function isObjectConfig(key: string): boolean {
  return key === 'tls' || key === 'ssl';
}
