// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { vi } from 'vitest';
import * as warehouseSql from '../../data-warehouse/warehouse-sql';
import { SqlBuilder } from '../../fhir/sql';
import { S3TablesWarehouseDestination } from './data-warehouse-destination';

const tableSpec = { postgresTable: 'Patient_History', icebergTable: 'patient_history' };
const connection = {} as never;

describe('data warehouse aws destination', () => {
  test('s3tables destination builds managed setup queries without postgres attach', () => {
    const destination = new S3TablesWarehouseDestination(
      'us-east-1',
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test'
    );
    const queries = destination.getSetupQueries();
    expect(queries.join('\n')).toContain("CREATE SECRET ( TYPE S3, PROVIDER CREDENTIAL_CHAIN, REGION 'us-east-1' )");
    expect(queries.join('\n')).toContain("ATTACH 'arn:aws:s3tables:us-east-1:123456789012:bucket/test'");
    expect(queries.join('\n')).toContain('ENDPOINT_TYPE s3_tables');
    expect(queries.join('\n')).not.toContain('TYPE postgres');

    expect(destination.getPostgresAttachQueries('postgresql://user:pass@localhost/db')).toStrictEqual([
      'ATTACH \'postgresql://user:pass@localhost/db\' AS "pg_db" (TYPE postgres, READ_ONLY)',
    ]);
  });

  test('buildSourcePredicate queries Iceberg watermark before Postgres attach', async () => {
    vi.restoreAllMocks();
    const fetchWatermark = vi
      .spyOn(warehouseSql, 'fetchIcebergWatermark')
      .mockResolvedValue('2024-06-01T12:00:00.000Z');

    const destination = new S3TablesWarehouseDestination(
      'us-east-1',
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test'
    );
    const predicate = await destination.buildSourcePredicate(connection, tableSpec, 'default');

    expect(fetchWatermark).toHaveBeenCalledTimes(1);
    expect(fetchWatermark).toHaveBeenCalledWith(connection, 'iceberg_catalog.default.patient_history');
    expect(predicate).toBeDefined();
    const sql = new SqlBuilder();
    sql.appendExpression(predicate as never);
    expect(sql.toString()).toBe(`"lastUpdated" > $1`);
    expect(sql.getValues()).toStrictEqual(['2024-06-01T12:00:00.000Z']);
  });

  test('buildSourcePredicate omits filter when Iceberg table is empty', async () => {
    vi.restoreAllMocks();
    vi.spyOn(warehouseSql, 'fetchIcebergWatermark').mockResolvedValue(undefined);

    const destination = new S3TablesWarehouseDestination(
      'us-east-1',
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test'
    );
    const predicate = await destination.buildSourcePredicate(connection, tableSpec, 'default');

    expect(predicate).toBeUndefined();
  });
});
