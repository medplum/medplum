// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumServerConfig } from '../../config/types';
import { runS3TablesWarehouseMigrationsIfNeeded } from './run-s3-tables-warehouse-migrations';
import * as tableNames from './warehouse-table-names';

jest.mock('./s3-tables-client', () => ({
  createS3TablesClient: jest.fn(() => ({ send: jest.fn() })),
  ensureNamespaceExists: jest.fn().mockResolvedValue(undefined),
  ensureWarehouseHistoryIcebergTable: jest.fn().mockResolvedValue('skipped'),
}));

const dwClient: {
  ensureNamespaceExists: jest.Mock;
  ensureWarehouseHistoryIcebergTable: jest.Mock;
} = jest.requireMock('./s3-tables-client');

describe('runS3TablesWarehouseMigrationsIfNeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('no-op when dataWarehouse is absent', async () => {
    const config = { database: { runMigrations: true }, awsRegion: 'us-east-1' } as unknown as MedplumServerConfig;
    await runS3TablesWarehouseMigrationsIfNeeded(config);
    expect(dwClient.ensureNamespaceExists).not.toHaveBeenCalled();
  });

  test('no-op when data warehouse disabled', async () => {
    const config = {
      database: { runMigrations: true },
      awsRegion: 'us-east-1',
      dataWarehouse: { enabled: false },
    } as unknown as MedplumServerConfig;
    await runS3TablesWarehouseMigrationsIfNeeded(config);
    expect(dwClient.ensureNamespaceExists).not.toHaveBeenCalled();
  });

  test('no-op when sink is local', async () => {
    const config = {
      database: { runMigrations: true },
      awsRegion: 'us-east-1',
      dataWarehouse: { enabled: true, sink: 'local', cron: '0 * * * *', localBasePath: '/tmp/dw' },
    } as unknown as MedplumServerConfig;
    await runS3TablesWarehouseMigrationsIfNeeded(config);
    expect(dwClient.ensureNamespaceExists).not.toHaveBeenCalled();
  });

  test('throws when enabled but cron missing', async () => {
    const config = {
      database: { runMigrations: true },
      awsRegion: 'us-east-1',
      dataWarehouse: { enabled: true, sink: 's3tables', awsS3TableArn: 'arn:aws:s3tables:us-east-1:1:bucket/x' },
    } as unknown as MedplumServerConfig;
    await expect(runS3TablesWarehouseMigrationsIfNeeded(config)).rejects.toThrow('dataWarehouse.cron is required');
  });

  test('ensures namespace and tables when s3tables enabled', async () => {
    const spy = jest.spyOn(tableNames, 'getWarehouseSyncPostgresTableNames').mockReturnValue(['Patient_History']);
    try {
      const config = {
        database: { runMigrations: true },
        awsRegion: 'us-east-1',
        dataWarehouse: {
          enabled: true,
          sink: 's3tables',
          awsS3TableArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
          namespace: 'analytics',
          cron: '0 * * * *',
        },
      } as unknown as MedplumServerConfig;
      await runS3TablesWarehouseMigrationsIfNeeded(config);
      expect(dwClient.ensureNamespaceExists).toHaveBeenCalledWith(
        expect.anything(),
        'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
        'analytics'
      );
      expect(dwClient.ensureWarehouseHistoryIcebergTable).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
