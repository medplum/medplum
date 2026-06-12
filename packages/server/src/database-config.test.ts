// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
