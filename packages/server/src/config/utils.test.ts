// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { addDefaults, isBooleanConfig, isFloatConfig, isIntegerConfig, isObjectConfig, setValue } from './utils';

describe('utils', () => {
  test('isObjectConfig', () => {
    expect(isObjectConfig('smtp')).toBe(true);
    expect(isObjectConfig('bullmq.defaultBackoff')).toBe(true);
  });

  test('isBooleanConfig', () => {
    expect(isBooleanConfig('baseUrl')).toBe(false);
    expect(isBooleanConfig('logRequests')).toBe(true);
  });

  test('isIntegerConfig', () => {
    expect(isIntegerConfig('baseUrl')).toBe(false);
    expect(isIntegerConfig('port')).toBe(true);
    expect(isIntegerConfig('bullmq.defaultAttempts')).toBe(true);
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

  test('addDefaults sets bullmq defaults', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
    } as any);
    expect(config.bullmq?.defaultAttempts).toBe(3);
    expect(config.bullmq?.defaultBackoff).toEqual({ type: 'exponential', delay: 1000 });
  });

  test('addDefaults preserves existing bullmq config', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
      bullmq: { defaultAttempts: 5, defaultBackoff: { type: 'fixed', delay: 500 } },
    } as any);
    expect(config.bullmq?.defaultAttempts).toBe(5);
    expect(config.bullmq?.defaultBackoff).toEqual({ type: 'fixed', delay: 500 });
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

  test('setValue parses bullmq.defaultBackoff', () => {
    const config = {};
    setValue(config, 'bullmq.defaultBackoff', '{"type":"exponential","delay":2000}');
    expect(config).toEqual({
      bullmq: {
        defaultBackoff: { type: 'exponential', delay: 2000 },
      },
    });
  });

  test('setValue parses bullmq.defaultAttempts', () => {
    const config = {};
    setValue(config, 'bullmq.defaultAttempts', '5');
    expect(config).toEqual({
      bullmq: {
        defaultAttempts: 5,
      },
    });
  });

  test('addDefaults preserves partial bullmq config with defaultAttempts only', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
      bullmq: { defaultAttempts: 10 },
    } as any);
    expect(config.bullmq?.defaultAttempts).toBe(10);
    // defaultBackoff should use the default value
    expect(config.bullmq?.defaultBackoff).toEqual({ type: 'exponential', delay: 1000 });
  });

  test('addDefaults preserves partial bullmq config with defaultBackoff only', () => {
    const config = addDefaults({
      baseUrl: 'https://example.com',
      bullmq: { defaultBackoff: { type: 'fixed', delay: 3000 } },
    } as any);
    // defaultAttempts should use the default value
    expect(config.bullmq?.defaultAttempts).toBe(3);
    expect(config.bullmq?.defaultBackoff).toEqual({ type: 'fixed', delay: 3000 });
  });

  test('isFloatConfig', () => {
    expect(isFloatConfig('baseUrl')).toBe(false);
    expect(isFloatConfig('anything')).toBe(false);
  });
});
