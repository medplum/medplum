import pg, { Pool } from 'pg';
import { MedplumDatabaseSslConfig, loadConfig } from './config';
import { closeDatabase, initDatabase } from './database';

const poolSpy = jest.spyOn(pg, 'Pool').mockImplementation((...args) => new Pool(...args));

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

    // This throws because the test DB doesn't actually support SSL
    await expect(initDatabase(configCopy)).rejects.toThrow(/SSL/);

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
