// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as NodeStream from 'node:stream';
import type * as Pg from 'pg';
import { vi } from 'vitest';

const dbConfigTestState = vi.hoisted(() => ({
  advisoryLockResponse: true,
  poolConfigs: [] as Pg.PoolConfig[],
}));

vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events');
  const { Duplex, Readable, Writable } = await import('node:stream');
  type ReadableStream = NodeStream.Readable;
  type WritableStream = NodeStream.Writable;
  const { GetDataVersionSql, GetVersionSql } = await import('./migration-sql');
  const { getLatestPostDeployMigrationVersion, getPreDeployMigrationVersions } =
    await import('./migrations/migration-versions');
  const preDeployVersion = getPreDeployMigrationVersions().length;
  const latestVersion = getLatestPostDeployMigrationVersion();
  const original = await vi.importActual<typeof Pg>('pg');
  type ClientBase = Pg.ClientBase;
  type Pool = Pg.Pool;
  type PoolClient = Pg.PoolClient;
  type PoolConfig = Pg.PoolConfig;
  type QueryConfig<I = any[]> = Pg.QueryConfig<I>;
  type QueryResult<R extends Pg.QueryResultRow = Pg.QueryResultRow> = Pg.QueryResult<R>;
  type QueryResultRow = Pg.QueryResultRow;

  class MockPoolClient extends Duplex implements PoolClient {
    release(): void {}
    async connect(): Promise<ClientBase> {
      return this;
    }
    async query<R extends QueryResultRow = any, I = any[]>(sql: string | QueryConfig<I>): Promise<QueryResult<R>> {
      const result: QueryResult<R> = {
        command: '',
        rowCount: null,
        oid: -1,
        fields: [],
        rows: [],
      };
      if (sql === 'SELECT pg_try_advisory_lock($1)') {
        result.rows = [{ pg_try_advisory_lock: dbConfigTestState.advisoryLockResponse } as unknown as R];
      }
      if (sql === GetVersionSql) {
        result.rows = [{ version: preDeployVersion } as unknown as R];
      }
      if (sql === GetDataVersionSql) {
        result.rows = [{ dataVersion: latestVersion } as unknown as R];
      }

      return result;
    }
    copyFrom(_queryText: string): WritableStream {
      return new Writable();
    }
    copyTo(_queryText: string): ReadableStream {
      return new Readable();
    }
    pauseDrain(): void {}
    resumeDrain(): void {}
    escapeIdentifier(_str: string): string {
      return '';
    }
    escapeLiteral(_str: string): string {
      return '';
    }
    getTypeParser(): any {
      return undefined;
    }
    setTypeParser(): void {}
  }

  class MockPool extends EventEmitter implements Pool {
    expiredCount: number;
    ending: boolean;
    ended: boolean;
    options: Pg.PoolOptions;

    constructor(config?: PoolConfig) {
      super();
      if (config) {
        dbConfigTestState.poolConfigs.push(config);
      }
      this.expiredCount = 0;
      this.ending = false;
      this.ended = false;
      this.options = {
        max: -1,
        maxUses: -1,
        allowExitOnIdle: false,
        maxLifetimeSeconds: -1,
        idleTimeoutMillis: -1,
      };
    }

    totalCount = -1;
    idleCount = -1;
    waitingCount = -1;
    async connect(): Promise<PoolClient> {
      return new MockPoolClient();
    }
    on(): this {
      return this;
    }
    async end(): Promise<void> {}
    async query(): Promise<QueryResult> {
      return {
        command: '',
        rowCount: null,
        oid: -1,
        fields: [],
        rows: [],
      };
    }
  }

  return {
    ...original,
    Pool: MockPool,
    default: {
      ...original.default,
      Pool: MockPool,
    },
  };
});

import { deepClone } from '@medplum/core';
import { loadConfig, loadTestConfig } from './config/loader';
import type { MedplumDatabaseSslConfig } from './config/types';
import { closeDatabase, escapePgOptionsArg, getDefaultStatementTimeout, initDatabase } from './database';
import { globalLogger } from './logger';

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
    dbConfigTestState.advisoryLockResponse = true;
    dbConfigTestState.poolConfigs = [];
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
    expect(dbConfigTestState.poolConfigs).toHaveLength(1);
    expect(dbConfigTestState.poolConfigs[0]).toEqual(
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
    expect(dbConfigTestState.poolConfigs).toHaveLength(1);
    expect(dbConfigTestState.poolConfigs[0]).toEqual(
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
    dbConfigTestState.advisoryLockResponse = false;
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
    expect(dbConfigTestState.poolConfigs[0]).toEqual(
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
    expect(dbConfigTestState.poolConfigs[0]).toEqual(
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
    expect(dbConfigTestState.poolConfigs[0]).toEqual(
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
