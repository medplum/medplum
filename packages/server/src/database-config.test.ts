import { deepClone } from '@medplum/core';
import pg, { PoolConfig } from 'pg';
import { MedplumDatabaseConfig, MedplumDatabaseSslConfig, loadConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { MockPool } from './database-utils';

jest.mock('pg');

const poolSpy = jest.spyOn(pg, 'Pool').mockImplementation((_config?: PoolConfig) => {
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
