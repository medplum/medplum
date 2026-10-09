// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { addDefaults, isBooleanConfig, isIntegerConfig, isObjectConfig, setValue } from './utils';

describe('utils', () => {
  test('isObjectConfig', () => {
    expect(isObjectConfig('smtp')).toBe(true);
  });

  test('isBooleanConfig', () => {
    expect(isBooleanConfig('baseUrl')).toBe(false);
    expect(isBooleanConfig('logRequests')).toBe(true);
    expect(isBooleanConfig('rateLimitsEnabled')).toBe(true);
    expect(isBooleanConfig('requireVerifiedEmailForProjectCreation')).toBe(true);
    expect(isBooleanConfig('storeBotInput')).toBe(true);
  });

  test('isIntegerConfig', () => {
    expect(isIntegerConfig('baseUrl')).toBe(false);
    expect(isIntegerConfig('port')).toBe(true);
    expect(isIntegerConfig('defaultMfaRateLimit')).toBe(true);
  });

  test('addDefaults sets maxSearchOffset default', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
    } as any);
    expect(config.maxSearchOffset).toBe(10_000);
  });

  test('addDefaults enables rate limits by default', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
    } as any);
    expect(config.rateLimitsEnabled).toBe(true);
    expect(config.defaultMfaRateLimit).toBe(10);
  });

  test('addDefaults preserves existing maxSearchOffset', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
      maxSearchOffset: 5000,
    } as any);
    expect(config.maxSearchOffset).toBe(5000);
  });

  test('setValue parses integers', () => {
    const config = {};
    setValue(config, 'database.port', '12345');
    expect(config).toEqual({
      database: {
        port: 12345,
      },
    });
  });

  test('setValue parses booleans', () => {
    const config = {};
    setValue(config, 'database.ssl.require', 'true');
    expect(config).toEqual({
      database: {
        ssl: {
          require: true,
        },
      },
    });
  });

  test('setValue parses rateLimitsEnabled as boolean', () => {
    const config = {};
    setValue(config, 'rateLimitsEnabled', 'false');
    expect(config).toEqual({ rateLimitsEnabled: false });
  });

  test('setValue parses requireVerifiedEmailForProjectCreation as boolean', () => {
    const config = {};
    setValue(config, 'requireVerifiedEmailForProjectCreation', 'false');
    expect(config).toEqual({ requireVerifiedEmailForProjectCreation: false });
  });

  test('setValue stores blockedEmailDomains as comma-separated list', () => {
    const config = {};
    setValue(config, 'blockedEmailDomains', 'example.com,test.com');
    expect(config).toEqual({
      blockedEmailDomains: ['example.com', 'test.com'],
    });
  });

  test('setValue stores disableChainedSearch as comma-separated list', () => {
    const config = {};
    setValue(config, 'disableChainedSearch', 'Observation, AuditEvent');
    expect(config).toEqual({
      disableChainedSearch: ['Observation', 'AuditEvent'],
    });
  });

  test('setValue parses objects', () => {
    const config = {};
    const jsonData = '{"host":"smtp.example.com","port":587,"username":"username","password":"p@ssw0rd"}';
    setValue(config, 'smtp', jsonData);
    expect(config).toEqual({
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        username: 'username',
        password: 'p@ssw0rd',
      },
    });
  });

  test('setValue types shard settings like their top-level equivalents', () => {
    const config = {};
    setValue(config, 'shards.shard-1.isDefaultShard', 'false');
    setValue(config, 'shards.shard-1.database.port', '5432');
    setValue(config, 'shards.shard-1.database.ssl.require', 'true');
    setValue(config, 'shards.shard-1.readonlyDatabase.maxConnections', '10');
    setValue(config, 'shards.shard-1.database.host', 'db.example.com');
    expect(config).toStrictEqual({
      shards: {
        'shard-1': {
          isDefaultShard: false,
          database: { port: 5432, ssl: { require: true }, host: 'db.example.com' },
          readonlyDatabase: { maxConnections: 10 },
        },
      },
    });
  });

  test('setValue parses shards as JSON', () => {
    const config = {};
    setValue(config, 'shards', '{"shard-1":{"isDefaultShard":true,"database":{"host":"h","port":5432}}}');
    expect(config).toStrictEqual({
      shards: { 'shard-1': { isDefaultShard: true, database: { host: 'h', port: 5432 } } },
    });
  });

  test('setValue does not descend into inherited members', () => {
    const config: Record<string, unknown> = {};
    setValue(config, 'x.toString.y', 'v');
    expect((Object.prototype.toString as unknown as Record<string, unknown>)['y']).toBeUndefined();
    expect(config).toStrictEqual({ x: { toString: { y: 'v' } } });
  });

  test.each([
    '__proto__.polluted',
    'shards.__proto__.database.host',
    'a.constructor.prototype.polluted',
    'constructor',
  ])('setValue rejects unsafe key %s', (key) => {
    const config: Record<string, unknown> = {};
    expect(() => setValue(config, key, 'v')).toThrow(`Invalid config key: ${key}`);
    expect(config).toStrictEqual({});
    expect((Object.prototype as unknown as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
