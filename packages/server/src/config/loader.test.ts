// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fs from 'fs';
import { getConfig, loadConfig, loadTestConfig } from './loader';

describe('Config', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeysToClean: string[] = [];

  function setEnv(key: string, value: string): void {
    if (!(key in savedEnv)) {
      savedEnv[key] = process.env[key];
    }
    envKeysToClean.push(key);
    process.env[key] = value;
  }

  afterEach(() => {
    for (const key of envKeysToClean) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    envKeysToClean.length = 0;
  });

  test('getConfig before loading', async () => {
    // Use isolateModules to get a fresh module where cachedConfig is undefined
    await jest.isolateModulesAsync(async () => {
      const { getConfig: freshGetConfig } = await import('./loader');
      expect(() => freshGetConfig()).toThrow('Config not loaded');
    });
  });

  test('Unrecognized config', async () => {
    await expect(loadConfig('unrecognized')).rejects.toThrow('Unrecognized config type: unrecognized');
  });

  test('Load config file', async () => {
    const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');

    const config = await loadConfig('file:medplum.config.json');

    expect(readFileSyncSpy).toHaveBeenCalled();
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(getConfig()).toBe(config);
  });

  test('Missing baseUrl throws', async () => {
    setEnv('MEDPLUM_PORT', '3000');
    await expect(loadConfig('env')).rejects.toThrow('Missing required config setting: baseUrl');
  });

  test('Empty baseUrl throws', async () => {
    setEnv('MEDPLUM_BASE_URL', '');
    await expect(loadConfig('env')).rejects.toThrow('Missing required config setting: baseUrl');
  });

  test('Whitespace-only baseUrl throws', async () => {
    setEnv('MEDPLUM_BASE_URL', '   ');
    await expect(loadConfig('env')).rejects.toThrow('Missing required config setting: baseUrl');
  });

  test('Load env config', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_PORT', '3000');
    setEnv('MEDPLUM_DATABASE_PORT', '5432');
    setEnv('MEDPLUM_REDIS_TLS', '{}');
    setEnv('MEDPLUM_DATABASE_SSL', '{"require":true}');
    setEnv('MEDPLUM_SMTP_HOST', 'smtp.example.com');

    const config = await loadConfig('env');
    expect(config).toBeDefined();
    expect(config.baseUrl).toStrictEqual('http://localhost:3000');
    expect(config.port).toStrictEqual(3000);
    expect(config.database.port).toStrictEqual(5432);
    expect(config.redis.tls).toStrictEqual({});
    expect(config.database.ssl).toStrictEqual({ require: true });
    expect(config.smtp?.host).toStrictEqual('smtp.example.com');
    expect(getConfig()).toBe(config);
  });

  test('Env config ignores non-MEDPLUM_ variables', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('NOT_MEDPLUM_SOMETHING', 'ignored');
    setEnv('BASE_URL', 'also-ignored');

    const config = await loadConfig('env');
    expect(config.baseUrl).toStrictEqual('http://localhost:3000');
    expect((config as unknown as Record<string, unknown>)['something']).toBeUndefined();
  });

  test('Env config camelCase conversion', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_LOG_LEVEL', 'debug');
    setEnv('MEDPLUM_APP_BASE_URL', 'http://localhost:4000');

    const config = await loadConfig('env');
    expect(config.logLevel).toStrictEqual('debug');
    expect(config.appBaseUrl).toStrictEqual('http://localhost:4000');
  });

  test('Env config boolean values', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_REGISTER_ENABLED', 'true');
    setEnv('MEDPLUM_LOG_REQUESTS', 'false');
    setEnv('MEDPLUM_BOT_CUSTOM_FUNCTIONS_ENABLED', 'true');

    const config = await loadConfig('env');
    expect(config.registerEnabled).toBe(true);
    expect(config.logRequests).toBe(false);
    expect(config.botCustomFunctionsEnabled).toBe(true);
  });

  test('Env config integer values', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_PORT', '9000');
    setEnv('MEDPLUM_ACCURATE_COUNT_THRESHOLD', '500000');
    setEnv('MEDPLUM_SHUTDOWN_TIMEOUT_MILLISECONDS', '60000');
    setEnv('MEDPLUM_DEFAULT_RATE_LIMIT', '100');
    setEnv('MEDPLUM_BCRYPT_HASH_SALT', '12');

    const config = await loadConfig('env');
    expect(config.port).toStrictEqual(9000);
    expect(config.accurateCountThreshold).toStrictEqual(500000);
    expect(config.shutdownTimeoutMilliseconds).toStrictEqual(60000);
    expect(config.defaultRateLimit).toStrictEqual(100);
    expect(config.bcryptHashSalt).toStrictEqual(12);
  });

  test('Env config cacheRedis prefix', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_CACHE_REDIS_HOST', 'cache-redis.example.com');
    setEnv('MEDPLUM_CACHE_REDIS_PORT', '6380');
    setEnv('MEDPLUM_CACHE_REDIS_PASSWORD', 'cache-secret');

    const config = await loadConfig('env');
    expect(config.cacheRedis).toBeDefined();
    expect(config.cacheRedis?.host).toStrictEqual('cache-redis.example.com');
    // port is recognized as integer because 'port' is in integerKeys
    expect(config.cacheRedis?.port).toStrictEqual(6380);
    expect(config.cacheRedis?.password).toStrictEqual('cache-secret');
  });

  test('Env config rateLimitRedis prefix', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_RATE_LIMIT_REDIS_HOST', 'ratelimit-redis.example.com');
    setEnv('MEDPLUM_RATE_LIMIT_REDIS_PORT', '6381');

    const config = await loadConfig('env');
    expect(config.rateLimitRedis).toBeDefined();
    expect(config.rateLimitRedis?.host).toStrictEqual('ratelimit-redis.example.com');
    expect(config.rateLimitRedis?.port).toStrictEqual(6381);
  });

  test('Env config pubsubRedis prefix', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_PUBSUB_REDIS_HOST', 'pubsub-redis.example.com');
    setEnv('MEDPLUM_PUBSUB_REDIS_PORT', '6382');

    const config = await loadConfig('env');
    expect(config.pubsubRedis).toBeDefined();
    expect(config.pubsubRedis?.host).toStrictEqual('pubsub-redis.example.com');
    expect(config.pubsubRedis?.port).toStrictEqual(6382);
  });

  test('Env config backgroundJobsRedis prefix', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_BACKGROUND_JOBS_REDIS_HOST', 'jobs-redis.example.com');
    setEnv('MEDPLUM_BACKGROUND_JOBS_REDIS_PORT', '6383');

    const config = await loadConfig('env');
    expect(config.backgroundJobsRedis).toBeDefined();
    expect(config.backgroundJobsRedis?.host).toStrictEqual('jobs-redis.example.com');
    // port is recognized as integer because 'port' is in integerKeys
    expect(config.backgroundJobsRedis?.port).toStrictEqual(6383);
  });

  test('Env config bullmq prefix', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_BULLMQ_CONCURRENCY', '10');

    const config = await loadConfig('env');
    expect(config.bullmq).toBeDefined();
    // 'concurrency' is not in top-level integerKeys (only 'bullmq.concurrency'), so it stays as string
    expect(config.bullmq?.concurrency).toStrictEqual('10');
  });

  test('Env config fission prefix', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_FISSION_NAMESPACE', 'medplum');
    setEnv('MEDPLUM_FISSION_ROUTER_HOST', 'fission-router.example.com');
    setEnv('MEDPLUM_FISSION_ROUTER_PORT', '8888');

    const config = await loadConfig('env');
    expect(config.fission).toBeDefined();
    expect(config.fission?.namespace).toStrictEqual('medplum');
    expect(config.fission?.routerHost).toStrictEqual('fission-router.example.com');
    // 'routerPort' is not in top-level integerKeys (only 'fission.routerPort'), so it stays as string
    expect(config.fission?.routerPort).toStrictEqual('8888');
  });

  test('Env config redis prefix does not capture cacheRedis', async () => {
    // Ensure REDIS_ prefix doesn't accidentally consume CACHE_REDIS_ vars
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_REDIS_HOST', 'default-redis.example.com');
    setEnv('MEDPLUM_CACHE_REDIS_HOST', 'cache-redis.example.com');

    const config = await loadConfig('env');
    expect(config.redis.host).toStrictEqual('default-redis.example.com');
    expect(config.cacheRedis?.host).toStrictEqual('cache-redis.example.com');
  });

  test('Env config database integer keys', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_DATABASE_PORT', '5433');
    setEnv('MEDPLUM_DATABASE_MAX_CONNECTIONS', '50');

    const config = await loadConfig('env');
    // 'port' is in top-level integerKeys so it's parsed as int
    expect(config.database.port).toStrictEqual(5433);
    // 'maxConnections' is not in top-level integerKeys (only 'database.maxConnections'), so it stays as string
    expect(config.database.maxConnections).toStrictEqual('50');
  });

  test('Env config database boolean keys', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_DATABASE_RUN_MIGRATIONS', 'true');
    setEnv('MEDPLUM_DATABASE_DISABLE_CONNECTION_CONFIGURATION', 'false');

    const config = await loadConfig('env');
    // 'runMigrations' is not in top-level booleanKeys (only 'database.runMigrations'), so it stays as string
    expect(config.database.runMigrations).toStrictEqual('true');
    expect(config.database.disableConnectionConfiguration).toStrictEqual('false');
  });

  test('Env config object values', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_DEFAULT_PROJECT_SYSTEM_SETTING', '[{"name":"foo","value":"bar"}]');

    const config = await loadConfig('env');
    expect(config.defaultProjectSystemSetting).toStrictEqual([{ name: 'foo', value: 'bar' }]);
  });

  test('Env config redis with all fields', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_REDIS_HOST', 'redis.example.com');
    setEnv('MEDPLUM_REDIS_PORT', '6379');
    setEnv('MEDPLUM_REDIS_PASSWORD', 'secret');
    setEnv('MEDPLUM_REDIS_DB', '5');

    const config = await loadConfig('env');
    expect(config.redis.host).toStrictEqual('redis.example.com');
    // 'port' is in top-level integerKeys so it's parsed as int
    expect(config.redis.port).toStrictEqual(6379);
    expect(config.redis.password).toStrictEqual('secret');
    // 'db' is not in top-level integerKeys (only 'redis.db'), so it stays as string
    expect(config.redis.db).toStrictEqual('5');
  });

  test('Env config smtp with all fields', async () => {
    setEnv('MEDPLUM_BASE_URL', 'http://localhost:3000');
    setEnv('MEDPLUM_SMTP_HOST', 'smtp.example.com');
    setEnv('MEDPLUM_SMTP_PORT', '587');
    setEnv('MEDPLUM_SMTP_USERNAME', 'user@example.com');
    setEnv('MEDPLUM_SMTP_PASSWORD', 'smtp-secret');

    const config = await loadConfig('env');
    expect(config.smtp).toBeDefined();
    expect(config.smtp?.host).toStrictEqual('smtp.example.com');
    expect(config.smtp?.port).toStrictEqual(587);
    expect(config.smtp?.username).toStrictEqual('user@example.com');
    expect(config.smtp?.password).toStrictEqual('smtp-secret');
  });

  test('Load file config sets defaults', async () => {
    const config = await loadConfig('file:medplum.config.json');
    // Verify addDefaults was applied
    expect(config.issuer).toBeDefined();
    expect(config.jwksUrl).toBeDefined();
    expect(config.authorizeUrl).toBeDefined();
    expect(config.tokenUrl).toBeDefined();
    expect(config.userInfoUrl).toBeDefined();
    expect(config.introspectUrl).toBeDefined();
    expect(config.awsRegion).toBeDefined();
  });

  test('Load AWS config', async () => {
    const mockConfig = { baseUrl: 'http://aws.example.com', database: {}, redis: {} };
    jest.mock('../cloud/aws/config', () => ({
      loadAwsConfig: jest.fn().mockResolvedValue(mockConfig),
    }));

    await jest.isolateModulesAsync(async () => {
      const { loadConfig: freshLoadConfig } = await import('./loader');
      const config = await freshLoadConfig('aws:my-ssm-path');
      expect(config.baseUrl).toStrictEqual('http://aws.example.com');
    });
  });

  test('Load GCP config', async () => {
    const mockConfig = { baseUrl: 'http://gcp.example.com', database: {}, redis: {} };
    jest.mock('../cloud/gcp/config', () => ({
      loadGcpConfig: jest.fn().mockResolvedValue(mockConfig),
    }));

    await jest.isolateModulesAsync(async () => {
      const { loadConfig: freshLoadConfig } = await import('./loader');
      const config = await freshLoadConfig('gcp:my-project');
      expect(config.baseUrl).toStrictEqual('http://gcp.example.com');
    });
  });

  test('Load Azure config', async () => {
    const mockConfig = { baseUrl: 'http://azure.example.com', database: {}, redis: {} };
    jest.mock('../cloud/azure/config', () => ({
      loadAzureConfig: jest.fn().mockResolvedValue(mockConfig),
    }));

    await jest.isolateModulesAsync(async () => {
      const { loadConfig: freshLoadConfig } = await import('./loader');
      const config = await freshLoadConfig('azure:my-vault');
      expect(config.baseUrl).toStrictEqual('http://azure.example.com');
    });
  });

  test('loadTestConfig', async () => {
    const config = await loadTestConfig();
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.binaryStorage).toMatch(/^file:/);
    expect(config.allowedOrigins).toBeUndefined();
    expect(config.database.dbname).toStrictEqual('medplum_test');
    expect(config.database.runMigrations).toBe(false);
    expect(config.database.disableRunPostDeployMigrations).toBe(true);
    expect(config.readonlyDatabase).toBeDefined();
    expect(config.readonlyDatabase?.username).toStrictEqual('medplum_test_readonly');
    expect(config.readonlyDatabase?.password).toStrictEqual('medplum_test_readonly');
    expect(config.redis.db).toStrictEqual(7);
    expect(config.approvedSenderEmails).toStrictEqual('no-reply@example.com');
    expect(config.emailProvider).toStrictEqual('none');
    expect(config.logLevel).toStrictEqual('error');
    expect(config.defaultRateLimit).toStrictEqual(-1);
    expect(config.defaultSuperAdminClientId).toBeDefined();
    expect(config.defaultSuperAdminClientSecret).toBeDefined();
  });
});
