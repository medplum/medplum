// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumServerConfig } from './types';
import {
  getDataWarehouseConfigErrors,
  isDataWarehouseSyncOperational,
  warnInvalidDataWarehouseConfig,
} from './validate-config';

function baseServerConfig(overrides?: Partial<MedplumServerConfig>): MedplumServerConfig {
  return {
    baseUrl: 'http://localhost:8103',
    database: { host: 'h', dbname: 'd', username: 'u', password: 'p' },
    redis: { host: 'localhost', port: 6379 },
    ...overrides,
  } as MedplumServerConfig;
}

describe('getDataWarehouseConfigErrors', () => {
  test('returns no errors when dataWarehouse is absent', () => {
    expect(getDataWarehouseConfigErrors(baseServerConfig())).toStrictEqual([]);
  });

  test('returns no errors when dataWarehouse.enabled is false', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: { enabled: false, destination: 's3tables' },
        })
      )
    ).toStrictEqual([]);
  });

  test('returns error when startDate is not a valid timestamp', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            cron: '0 * * * *',
            destination: 'local',
            localBasePath: '/tmp/out',
            startDate: 'not-a-date',
          },
        })
      )
    ).toContain('dataWarehouse.startDate must be a valid ISO 8601 timestamp');
  });

  test('returns no error when startDate is empty string', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            cron: '0 * * * *',
            destination: 'local',
            localBasePath: '/tmp/out',
            startDate: '',
          },
        })
      )
    ).toStrictEqual([]);
  });

  test('returns no errors when enabled is false even if destination fields are missing', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: { enabled: false, destination: 's3tables' },
        })
      )
    ).toStrictEqual([]);
  });

  test('returns error when enabled and cron is missing', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            destination: 's3tables',
            awsS3TableArn: 'arn:aws:s3tables:us-east-1:1:bucket/x',
            namespace: 'default',
          },
        })
      )
    ).toContain('dataWarehouse.cron is required when dataWarehouse.enabled is true');
  });

  test('returns error when enabled and cron is whitespace only', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            cron: '   ',
            destination: 's3tables',
            awsS3TableArn: 'arn:aws:s3tables:us-east-1:1:bucket/x',
            namespace: 'default',
          },
        })
      )
    ).toContain('dataWarehouse.cron is required when dataWarehouse.enabled is true');
  });

  test('returns error when destination is s3tables (default) and awsS3TableArn is missing', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *' },
        })
      )
    ).toContain('dataWarehouse.destination must be "s3tables" or "local"');
  });

  test('returns error when destination is s3tables and awsS3TableArn is whitespace only', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *', destination: 's3tables', awsS3TableArn: '  ' },
        })
      )
    ).toContain('dataWarehouse.awsS3TableArn is required when dataWarehouse.destination is "s3tables"');
  });

  test('returns no errors when destination is s3tables and required fields are set', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            cron: '0 * * * *',
            destination: 's3tables',
            awsS3TableArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
            namespace: 'default',
          },
        })
      )
    ).toStrictEqual([]);
  });

  test('returns error when destination is local and localBasePath is missing', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *', destination: 'local' },
        })
      )
    ).toContain('dataWarehouse.localBasePath is required when dataWarehouse.destination is "local"');
  });

  test('returns no errors when destination is local and localBasePath is set', () => {
    expect(
      getDataWarehouseConfigErrors(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *', destination: 'local', localBasePath: '/tmp/out' },
        })
      )
    ).toStrictEqual([]);
  });
});

describe('isDataWarehouseSyncOperational', () => {
  test('is false when disabled', () => {
    expect(
      isDataWarehouseSyncOperational(
        baseServerConfig({
          dataWarehouse: { enabled: false },
        })
      )
    ).toBe(false);
  });

  test('is false when enabled but invalid', () => {
    expect(
      isDataWarehouseSyncOperational(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *' },
        })
      )
    ).toBe(false);
  });

  test('is true when enabled and valid', () => {
    expect(
      isDataWarehouseSyncOperational(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            cron: '0 * * * *',
            destination: 's3tables',
            awsS3TableArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
            namespace: 'default',
          },
        })
      )
    ).toBe(true);
  });
});

describe('warnInvalidDataWarehouseConfig', () => {
  test('does not log when configuration is valid', () => {
    const logger = { warn: jest.fn() } as any;
    warnInvalidDataWarehouseConfig(
      baseServerConfig({
        dataWarehouse: {
          enabled: true,
          cron: '0 * * * *',
          destination: 'local',
          localBasePath: '/tmp/out',
        },
      }),
      logger
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('logs when enabled but invalid', () => {
    const logger = { warn: jest.fn() } as any;
    warnInvalidDataWarehouseConfig(
      baseServerConfig({
        dataWarehouse: { enabled: true, cron: '0 * * * *' },
      }),
      logger
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Data warehouse sync is enabled but configuration is invalid; sync worker will not start',
      expect.objectContaining({ errors: expect.any(Array) })
    );
  });
});
