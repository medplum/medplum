import { deepClone } from '@medplum/core';
import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';
import pg, { Pool, PoolClient, PoolConfig, QueryArrayResult } from 'pg';
import { Readable, Writable } from 'stream';
import { MedplumDatabaseConfig, MedplumDatabaseSslConfig, loadConfig } from './config';
import { closeDatabase, initDatabase } from './database';

jest.mock('pg');

const poolSpy = jest.spyOn(pg, 'Pool').mockImplementation((_config?: PoolConfig) => {
  class MockPoolClient extends Duplex implements PoolClient {
    release(): void {}
    async connect(): Promise<void> {}
    async query(): Promise<QueryArrayResult<any>> {
      return {
        command: '',
        rowCount: null,
        oid: -1,
        fields: [],
        rows: [],
      };
    }
    copyFrom(_queryText: string): Writable {
      return new Writable();
    }
    copyTo(_queryText: string): Readable {
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
    totalCount = -1;
    idleCount = -1;
    waitingCount = -1;
    async connect(): Promise<pg.PoolClient> {
      return new MockPoolClient();
    }
    on(): this {
      return this;
    }
    async end(): Promise<void> {}
    async query(): Promise<QueryArrayResult<any>> {
      return {
        command: '',
        rowCount: null,
        oid: -1,
        fields: [],
        rows: [],
      };
    }
  }

  return new MockPool();
});

describe('Database config', () => {
  beforeEach(() => {
    poolSpy.mockClear();
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
    const databaseConfig = configCopy.database as MedplumDatabaseConfig;
    const sslConfig = {
      rejectUnauthorized: true,
      require: true,
      ca: '__THIS_SHOULD_BE_A_PEM_FILE__',
    } satisfies MedplumDatabaseSslConfig;
    databaseConfig.ssl = sslConfig;

    await initDatabase(configCopy);
    expect(poolSpy).toHaveBeenCalledTimes(1);
    expect(poolSpy).toHaveBeenCalledWith(
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

    const databaseConfig = configCopy.database as MedplumDatabaseConfig;

    await initDatabase(configCopy);
    expect(poolSpy).toHaveBeenCalledTimes(1);
    expect(poolSpy).toHaveBeenCalledWith(
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
});
