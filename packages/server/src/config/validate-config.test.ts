// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumServerConfig } from './types';
import { validateDataWarehouseConfig } from './validate-config';

function baseServerConfig(overrides?: Partial<MedplumServerConfig>): MedplumServerConfig {
  return {
    baseUrl: 'http://localhost:8103',
    database: { host: 'h', dbname: 'd', username: 'u', password: 'p' },
    redis: { host: 'localhost', port: 6379 },
    ...overrides,
  } as MedplumServerConfig;
}

describe('validateDataWarehouseConfig', () => {
  test('no-ops when dataWarehouse is absent', () => {
    expect(() => validateDataWarehouseConfig(baseServerConfig())).not.toThrow();
  });

  test('no-ops when dataWarehouse.enabled is false', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: { enabled: false, sink: 's3tables' },
        })
      )
    ).not.toThrow();
  });

  test('no-ops when enabled is false even if sink fields are missing', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: { enabled: false, sink: 's3tables' },
        })
      )
    ).not.toThrow();
  });

  test('throws when enabled and cron is missing', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: { enabled: true, sink: 's3tables', awsS3TableArn: 'arn:aws:s3tables:us-east-1:1:bucket/x' },
        })
      )
    ).toThrow('dataWarehouse.cron is required when dataWarehouse.enabled is true');
  });

  test('throws when enabled and cron is whitespace only', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            cron: '   ',
            sink: 's3tables',
            awsS3TableArn: 'arn:aws:s3tables:us-east-1:1:bucket/x',
          },
        })
      )
    ).toThrow('dataWarehouse.cron is required when dataWarehouse.enabled is true');
  });

  test('throws when sink is s3tables (default) and awsS3TableArn is missing', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *' },
        })
      )
    ).toThrow('dataWarehouse.sink must be "s3tables" or "local"');
  });

  test('throws when sink is s3tables and awsS3TableArn is whitespace only', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *', sink: 's3tables', awsS3TableArn: '  ' },
        })
      )
    ).toThrow('dataWarehouse.awsS3TableArn is required when dataWarehouse.sink is "s3tables"');
  });

  test('passes when sink is s3tables and awsS3TableArn is set', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: {
            enabled: true,
            cron: '0 * * * *',
            sink: 's3tables',
            awsS3TableArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
            namespace: 'default',
          },
        })
      )
    ).not.toThrow();
  });

  test('throws when sink is local and localBasePath is missing', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *', sink: 'local' },
        })
      )
    ).toThrow('dataWarehouse.localBasePath is required when dataWarehouse.sink is "local"');
  });

  test('passes when sink is local and localBasePath is set', () => {
    expect(() =>
      validateDataWarehouseConfig(
        baseServerConfig({
          dataWarehouse: { enabled: true, cron: '0 * * * *', sink: 'local', localBasePath: '/tmp/out' },
        })
      )
    ).not.toThrow();
  });
});
