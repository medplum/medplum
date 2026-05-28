// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  addDefaults,
  isBooleanConfig,
  isIntegerConfig,
  isObjectConfig,
  normalizeDate,
  setValue,
} from './utils';

describe('utils', () => {
  test('isObjectConfig', () => {
    expect(isObjectConfig('smtp')).toBe(true);
  });

  test('isBooleanConfig', () => {
    expect(isBooleanConfig('baseUrl')).toBe(false);
    expect(isBooleanConfig('logRequests')).toBe(true);
  });

  test('isIntegerConfig', () => {
    expect(isIntegerConfig('baseUrl')).toBe(false);
    expect(isIntegerConfig('port')).toBe(true);
  });

  test('addDefaults sets maxSearchOffset default', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
    } as any);
    expect(config.maxSearchOffset).toBe(10_000);
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

  test('addDefaults coerces dataWarehouse.startDate from JSON string to Date', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
      dataWarehouse: {
        startDate: '2024-01-01T00:00:00.000Z' as unknown as Date,
      },
    } as any);
    expect(config.dataWarehouse?.startDate).toEqual(new Date('2024-01-01T00:00:00.000Z'));
  });

  test('setValue parses date config keys', () => {
    const config = {};
    setValue(config, 'dataWarehouse.startDate', '2024-01-01T00:00:00.000Z');
    expect(config).toEqual({
      dataWarehouse: {
        startDate: new Date('2024-01-01T00:00:00.000Z'),
      },
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
});

describe('normalizeDate', () => {
  test('returns Date instances unchanged', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    expect(normalizeDate(date)).toBe(date);
  });

  test('parses ISO 8601 strings', () => {
    expect(normalizeDate('2024-01-01T00:00:00.000Z')).toEqual(new Date('2024-01-01T00:00:00.000Z'));
  });

  test('returns undefined for empty strings', () => {
    expect(normalizeDate('   ')).toBeUndefined();
  });
});
