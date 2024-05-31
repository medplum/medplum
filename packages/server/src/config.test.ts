import fs from 'fs';
import { getConfig, loadConfig } from './config';

describe('Config', () => {
  test('Unrecognized config', async () => {
    await expect(loadConfig('unrecognized')).rejects.toThrow();
  });

  test('Load config file', async () => {
    const readFileSyncSpy = jest.spyOn(fs, 'readFileSync');

    const config = await loadConfig('file:medplum.config.json');

    expect(readFileSyncSpy).toHaveBeenCalled();
    expect(config).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(getConfig()).toBe(config);
  });

  test('Load env config', async () => {
    process.env.MEDPLUM_BASE_URL = 'http://localhost:3000';
    process.env.MEDPLUM_PORT = '3000';
    process.env.MEDPLUM_DATABASE_PORT = '5432';
    process.env.MEDPLUM_REDIS_TLS = '{}';
    process.env.MEDPLUM_DATABASE_SSL = '{"require":true}';
    const config = await loadConfig('env');
    expect(config).toBeDefined();
    expect(config.baseUrl).toEqual('http://localhost:3000');
    expect(config.port).toEqual(3000);
    expect(config.database.port).toEqual(5432);
    expect(config.redis.tls).toEqual({});
    expect(config.database.ssl).toEqual({ require: true });
    expect(getConfig()).toBe(config);
  });
});
