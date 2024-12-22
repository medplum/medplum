import { deepClone, sleep } from '@medplum/core';
import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';
import pg, { Pool, PoolClient, PoolConfig, QueryArrayResult } from 'pg';
import { Readable, Writable } from 'stream';
import { MedplumDatabaseConfig, MedplumDatabaseSslConfig, loadConfig, loadTestConfig } from './config';
import {
  acquireAdvisoryLock,
  closeDatabase,
  DatabaseMode,
  getDatabasePool,
  initDatabase,
  releaseAdvisoryLock,
} from './database';

describe('Database config', () => {
  let poolSpy: jest.SpyInstance<pg.Pool, [config?: pg.PoolConfig | undefined]>;
  beforeAll(() => {
    jest.mock('pg');
    poolSpy = jest.spyOn(pg, 'Pool').mockImplementation((_config?: PoolConfig) => {
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
        expiredCount: number;
        ending: boolean;
        ended: boolean;
        options: pg.PoolOptions;

        constructor(_config?: PoolConfig) {
          super();
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
  });
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

describe('Advisory locks', () => {
  let clientA: PoolClient;
  let clientB: PoolClient;

  beforeEach(async () => {
    const config = await loadTestConfig();
    await initDatabase(config);
    const pool = getDatabasePool(DatabaseMode.READER);
    clientA = await pool.connect();
    clientB = await pool.connect();
    await clientA.query(`SET statement_timeout TO 100`);
    await clientB.query(`SET statement_timeout TO 100`);
  });

  afterEach(async () => {
    clientA.release();
    clientB.release();
    await closeDatabase();
  });

  test('Acquire', async () => {
    const aLock = await acquireAdvisoryLock(clientA, 123, { maxAttempts: 1, retryDelayMs: 10 });
    const bLock = await acquireAdvisoryLock(clientB, 123, { maxAttempts: 1, retryDelayMs: 10 });

    expect(aLock).toBe(true);
    expect(bLock).toBe(false);
  });

  test('Acquire and release', async () => {
    const aLock = await acquireAdvisoryLock(clientA, 123, { maxAttempts: 1, retryDelayMs: 10 });
    expect(aLock).toBe(true);

    let bLock: boolean = false;
    const aPromise = async (): Promise<void> => {
      await sleep(10);
      return releaseAdvisoryLock(clientA, 123);
    };
    const bPromise = async (): Promise<void> => {
      bLock = await acquireAdvisoryLock(clientB, 123, { maxAttempts: 2, retryDelayMs: 20 });
    };

    await Promise.all([aPromise(), bPromise()]);

    expect(bLock).toBe(true);
  });
});
