import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';
import pg, { Pool, PoolClient, PoolConfig, QueryArrayResult } from 'pg';
import { Readable, Writable } from 'stream';
import { MedplumDatabaseSslConfig, loadConfig } from './config';
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
  afterEach(() => {});

  afterAll(async () => {
    await closeDatabase();
  });

  test('SSL config', async () => {
    const config = await loadConfig('file:test.config.json');
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.database).toBeDefined();

    const databaseConfig = config.database;
    const configCopy = JSON.parse(JSON.stringify(databaseConfig));

    const sslConfig = {
      rejectUnauthorized: true,
      require: true,
      ca: '__THIS_SHOULD_BE_A_PEM_FILE__',
    } satisfies MedplumDatabaseSslConfig;
    configCopy.ssl = sslConfig;

    await initDatabase(configCopy, false);
    expect(poolSpy).toHaveBeenCalledTimes(1);
    expect(poolSpy).toHaveBeenCalledWith({
      host: databaseConfig.host,
      port: databaseConfig.port,
      password: databaseConfig.password,
      database: databaseConfig.dbname,
      user: databaseConfig.username,
      ssl: sslConfig,
    });
  });
});
