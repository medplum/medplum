// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fs from 'fs';
import { getConfig, loadConfig } from './loader';

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
    process.env.MEDPLUM_SMTP_HOST = 'smtp.example.com';

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
});
