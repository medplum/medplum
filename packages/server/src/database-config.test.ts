// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Signer } from '@aws-sdk/rds-signer';
import { deepClone } from '@medplum/core';
import type * as Pg from 'pg';
import { vi } from 'vitest';
import { loadConfig, loadTestConfig } from './config/loader';
import type { MedplumDatabaseSslConfig } from './config/types';
import { closeDatabase, escapePgOptionsArg, getDefaultStatementTimeout, initDatabase } from './database';
import { globalLogger } from './logger';
import { GetDataVersionSql, GetVersionSql } from './migration-sql';
import { getLatestPostDeployMigrationVersion, getPreDeployMigrationVersions } from './migrations/migration-versions';

const preDeployVersion = getPreDeployMigrationVersions().length;
const latestVersion = getLatestPostDeployMigrationVersion();

const { poolConfigs, mockState } = vi.hoisted(() => ({
  poolConfigs: [] as Pg.PoolConfig[],
  mockState: { advisoryLockResponse: true },
}));

const mockQueries = {
  GetVersionSql,
  GetDataVersionSql,
};

vi.mock('pg', async () => {
  const original = await vi.importActual<typeof Pg>('pg');

  class MockPoolClient {
    async query(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
      if (sql === 'SELECT pg_try_advisory_lock($1)') {
        return { rows: [{ pg_try_advisory_lock: mockState.advisoryLockResponse }] };
      }
      if (sql === mockQueries.GetVersionSql) {
        return { rows: [{ version: preDeployVersion }] };
      }
      if (sql === mockQueries.GetDataVersionSql) {
        return { rows: [{ dataVersion: latestVersion }] };
      }
      return { rows: [] };
    }

    release(): void {
      // Nothing to do
    }
  }

  class MockPool {
    constructor(config?: Pg.PoolConfig) {
      if (config) {
        poolConfigs.push(config);
      }
    }

    async connect(): Promise<MockPoolClient> {
      return new MockPoolClient();
    }

    async query(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
      return (await this.connect()).query(sql);
    }

    on(): void {
      // Nothing to do
    }

    async end(): Promise<void> {
      // Nothing to do
    }
  }

  return {
    ...original,
    Pool: MockPool,
  };
});

describe('Database config', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.spyOn(globalLogger, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockState.advisoryLockResponse = true;
    poolConfigs.length = 0;
  });

  afterEach(async () => {
    await closeDatabase();
  });

  test('SSL config', async () => {
    const config = await loadConfig('file:test.config.json');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.database).toBeDefined();

    const configCopy = deepClone(config);
    const databaseConfig = configCopy.database;
    const sslConfig = {
      rejectUnauthorized: true,
      require: true,
      ca: '__THIS_SHOULD_BE_A_PEM_FILE__',
    } satisfies MedplumDatabaseSslConfig;
    databaseConfig.ssl = sslConfig;

    await initDatabase(configCopy);
    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0]).toEqual(
      expect.objectContaining({
        host: databaseConfig.host,
        port: databaseConfig.port,
        password: databaseConfig.password,
        database: databaseConfig.dbname,
        user: databaseConfig.username,
        ssl: sslConfig,
      })
    );
  });

  test('RDS proxy', async () => {
    const config = await loadConfig('file:test.config.json');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.database).toBeDefined();

    const configCopy = deepClone(config);
    configCopy.databaseProxyEndpoint = 'test';
    delete configCopy.database.ssl;

    const databaseConfig = configCopy.database;

    await initDatabase(configCopy);
    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0]).toEqual(
      expect.objectContaining({
        host: configCopy.databaseProxyEndpoint,
        port: databaseConfig.port,
        password: databaseConfig.password,
        database: databaseConfig.dbname,
        user: databaseConfig.username,
        ssl: { require: true },
      })
    );
  });

  test('RDS proxy preserves existing SSL config', async () => {
    const config = await loadTestConfig();
    config.databaseProxyEndpoint = 'test';
    config.database.ssl = {
      ca: '__THIS_SHOULD_BE_A_PEM_FILE__',
      rejectUnauthorized: true,
    };

    await initDatabase(config);

    expect(poolConfigs[0]).toEqual(
      expect.objectContaining({
        host: config.databaseProxyEndpoint,
        ssl: {
          ca: '__THIS_SHOULD_BE_A_PEM_FILE__',
          rejectUnauthorized: true,
          require: true,
        },
      })
    );
  });

  test('Custom pool settings', async () => {
    const config = await loadTestConfig();
    config.database.maxConnections = 20;
    config.database.minConnections = 5;
    config.database.maxConnectionUses = 555;
    config.database.idleTimeoutMs = 30_000;
    config.database.connectionTimeoutMs = 10_000;

    await initDatabase(config);

    expect(poolConfigs[0]).toEqual(
      expect.objectContaining({
        max: 20,
        min: 5,
        maxUses: 555,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      })
    );
  });

  describe('IAM authentication', () => {
    beforeEach(() => {
      // Sign real tokens locally with test credentials; no AWS account or network is needed.
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access-key');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
      vi.stubEnv('AWS_SESSION_TOKEN', 'test-session-token');
      vi.stubEnv('AWS_PROFILE', undefined);
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    async function getToken(poolIndex = 0): Promise<URL> {
      const password = poolConfigs[poolIndex].password;
      if (typeof password !== 'function') {
        throw new Error('Expected a password callback');
      }
      return new URL('https://' + (await password()));
    }

    test.each([undefined, false])('Uses static passwords when iamAuth is %s', async (iamAuth) => {
      const config = await loadTestConfig();
      config.database.iamAuth = iamAuth;
      await initDatabase(config);
      expect(poolConfigs[0].password).toBe(config.database.password);
      expect(poolConfigs[0].ssl).toBe(config.database.ssl);
      expect(poolConfigs[1].password).toBe(config.readonlyDatabase?.password);
    });

    test('Signs new tokens after expiry using the configured endpoint, user, port, and region', async () => {
      const config = await loadTestConfig();
      config.awsRegion = 'eu-west-1';
      config.database = {
        host: 'writer.cluster-example.eu-west-1.rds.amazonaws.com',
        port: 5433,
        dbname: 'medplum',
        username: 'iam_user',
        iamAuth: true,
        runMigrations: false,
      };
      await initDatabase(config);

      const first = await getToken();
      expect(first.host).toBe(config.database.host + ':5433');
      expect(first.searchParams.get('DBUser')).toBe('iam_user');
      expect(first.searchParams.get('Action')).toBe('connect');
      expect(first.searchParams.get('X-Amz-Credential')).toBe('test-access-key/20260101/eu-west-1/rds-db/aws4_request');
      expect(first.searchParams.get('X-Amz-Security-Token')).toBe('test-session-token');
      expect(first.searchParams.get('X-Amz-Expires')).toBe('900');
      expect(first.searchParams.get('X-Amz-Date')).toBe('20260101T000000Z');
      expect(poolConfigs[0].ssl).toEqual({ require: true });

      vi.setSystemTime(new Date('2026-01-01T00:16:00Z'));
      const second = await getToken();
      expect(second.searchParams.get('X-Amz-Date')).toBe('20260101T001600Z');
      expect(second.searchParams.get('X-Amz-Signature')).not.toBe(first.searchParams.get('X-Amz-Signature'));
      expect(config.database.password).toBeUndefined();
    });

    test('Defaults the token and connection to port 5432 even when PGPORT is set', async () => {
      vi.stubEnv('PGPORT', '6543');
      const config = await loadTestConfig();
      config.database.iamAuth = true;
      delete config.database.port;
      await initDatabase(config);
      expect(poolConfigs[0].port).toBe(5432);
      expect((await getToken()).port).toBe('5432');
    });

    test('Preserves TLS options without changing the source config and ignores a static password', async () => {
      const config = await loadTestConfig();
      config.database.iamAuth = true;
      config.database.ssl = {
        ca: 'test-ca',
        cert: 'test-cert',
        key: 'test-key',
        rejectUnauthorized: true,
        require: false,
      };
      const before = deepClone(config.database);
      await initDatabase(config);
      expect(poolConfigs[0].ssl).toEqual({ ...before.ssl, require: true });
      expect(typeof poolConfigs[0].password).toBe('function');
      expect(config.database).toEqual(before);
    });

    test('Signs for each proxy endpoint and supports a reader in a different region', async () => {
      const config = await loadTestConfig();
      config.database.iamAuth = true;
      config.databaseProxyEndpoint = 'writer.proxy-example.us-east-1.rds.amazonaws.com';
      config.readonlyDatabase = {
        ...config.database,
        username: 'reader',
        awsRegion: 'us-west-2',
      };
      config.readonlyDatabaseProxyEndpoint = 'reader.proxy-example.us-west-2.rds.amazonaws.com';
      await initDatabase(config);

      expect((await getToken()).hostname).toBe(config.databaseProxyEndpoint);
      const reader = await getToken(1);
      expect(reader.hostname).toBe(config.readonlyDatabaseProxyEndpoint);
      expect(reader.searchParams.get('DBUser')).toBe('reader');
      expect(reader.searchParams.get('X-Amz-Credential')).toContain('/us-west-2/rds-db/');
      expect(poolConfigs[1].ssl).toEqual({ require: true });
    });

    test('Configures IAM independently for shard writer and reader pools', async () => {
      const config = await loadTestConfig();
      config.awsRegion = 'eu-central-1';
      config.shards = {
        'shard-1': {
          id: 'shard-1',
          database: { host: 'shard-writer', username: 'writer', iamAuth: true, runMigrations: false },
          readonlyDatabase: { host: 'shard-reader', username: 'reader', iamAuth: true, awsRegion: 'eu-west-2' },
        },
      };
      await initDatabase(config);
      expect(poolConfigs).toHaveLength(4);
      expect(poolConfigs[0].password).toBe(config.database.password);
      expect(poolConfigs[1].password).toBe(config.readonlyDatabase?.password);
      const writer = await getToken(2);
      expect(writer.hostname).toBe('shard-writer');
      expect(writer.searchParams.get('X-Amz-Credential')).toContain('/eu-central-1/rds-db/');
      const reader = await getToken(3);
      expect(reader.hostname).toBe('shard-reader');
      expect(reader.searchParams.get('DBUser')).toBe('reader');
      expect(reader.searchParams.get('X-Amz-Credential')).toContain('/eu-west-2/rds-db/');
    });

    test.each(['host', 'username'] as const)('Rejects missing %s before creating an IAM pool', async (key) => {
      const config = await loadTestConfig();
      config.database.iamAuth = true;
      delete config.database[key];
      await expect(initDatabase(config)).rejects.toThrow(
        'Database IAM authentication requires an explicit host and username'
      );
      expect(poolConfigs).toHaveLength(0);
    });

    test('Defers signing until connection time and propagates signer failures without password fallback', async () => {
      const config = await loadTestConfig();
      config.database.iamAuth = true;
      const signer = vi.spyOn(Signer.prototype, 'getAuthToken').mockRejectedValue(new Error('Credentials unavailable'));
      try {
        await initDatabase(config);
        expect(signer).not.toHaveBeenCalled();
        await expect(getToken()).rejects.toThrow('Credentials unavailable');
        expect(signer).toHaveBeenCalledOnce();
      } finally {
        signer.mockRestore();
      }
    });
  });

  test('Cannot acquire migration lock', async () => {
    mockState.advisoryLockResponse = false;
    const config = await loadTestConfig();
    config.database.runMigrations = true;
    const initDBPromise = initDatabase(config);

    vi.runAllTimersAsync().catch((reason) => globalLogger.error('Unexpected error in vi.runAllTimersAsync', reason));

    await expect(initDBPromise).rejects.toThrow('Failed to acquire migration lock');
  });

  test('Default connection settings', async () => {
    const config = await loadTestConfig();
    config.database.disableConnectionConfiguration = false;
    await initDatabase(config);
    expect(poolConfigs[0]).toEqual(
      expect.objectContaining({
        options: `-c statement_timeout=60000 -c default_transaction_isolation=repeatable\\ read -c idle_in_transaction_session_timeout=30000`,
      })
    );
  });

  test('Custom query timeout', async () => {
    const config = await loadTestConfig();
    config.database.disableConnectionConfiguration = false;
    config.database.queryTimeout = 5000;
    await initDatabase(config);
    expect(poolConfigs[0]).toEqual(
      expect.objectContaining({
        options: `-c statement_timeout=5000 -c default_transaction_isolation=repeatable\\ read -c idle_in_transaction_session_timeout=30000`,
      })
    );
  });

  test('Disabled connection configuration', async () => {
    const config = await loadTestConfig();
    config.database.queryTimeout = 12345;
    config.database.disableConnectionConfiguration = true;
    await initDatabase(config);
    expect(poolConfigs[0]).toEqual(
      expect.objectContaining({
        options: undefined,
      })
    );
  });

  test('escapePgOptionsArg', () => {
    expect(escapePgOptionsArg('repeatable read')).toBe('repeatable\\ read');
    expect(escapePgOptionsArg('a\\b c')).toBe('a\\\\b\\ c');
  });

  test('getDefaultStatementTimeout', async () => {
    const config = await loadTestConfig();
    config.database.disableConnectionConfiguration = true;
    expect(getDefaultStatementTimeout(config.database)).toBe('DEFAULT');

    config.database.disableConnectionConfiguration = false;
    config.database.queryTimeout = 5000;
    expect(getDefaultStatementTimeout(config.database)).toBe(5000);

    config.database.queryTimeout = undefined;
    expect(getDefaultStatementTimeout(config.database)).toBe(60000);
  });
});
