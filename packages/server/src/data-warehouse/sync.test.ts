// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { S3TablesWarehouseDestination } from '../cloud/aws/data-warehouse-destination';
import type { Expression } from '../fhir/sql';
import { SqlBuilder } from '../fhir/sql';
import { LocalParquetWarehouseDestination } from './destination';
import type { SyncOptions } from './sync';
import { buildWarehouseSourcePredicate } from './sync';
import { buildMaxLastUpdatedWatermarkPredicate, buildStartDatePredicate } from './warehouse-sql';

const tableSpec = { postgresTable: 'Patient_history', icebergTable: 'patient_history' };
const namespace = 'default';

function appendPredicateSql(predicate: Expression): {
  sql: string;
  values: unknown[];
} {
  const builder = new SqlBuilder();
  builder.appendExpression(predicate);
  return { sql: builder.toString(), values: builder.getValues() };
}

function makeSyncOptions(overrides: Partial<SyncOptions> & Pick<SyncOptions, 'destination'>): SyncOptions {
  return {
    database: {},
    warehouseSources: [tableSpec],
    ...overrides,
  };
}

function assertDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

describe('buildWarehouseSourcePredicate', () => {
  test('returns undefined when destination has no predicate and startDate is omitted', () => {
    const destination = new LocalParquetWarehouseDestination('/tmp/dw-sync-test');
    const predicate = buildWarehouseSourcePredicate(makeSyncOptions({ destination }), tableSpec, namespace);
    expect(predicate).toBeUndefined();
  });

  test('returns startDate predicate only when destination has no predicate', () => {
    const startDate = '2024-01-01T00:00:00.000Z';
    const destination = new LocalParquetWarehouseDestination('/tmp/dw-sync-test');
    const predicate = buildWarehouseSourcePredicate(makeSyncOptions({ destination, startDate }), tableSpec, namespace);

    assertDefined(predicate);
    expect(appendPredicateSql(predicate)).toStrictEqual({
      sql: appendPredicateSql(buildStartDatePredicate(startDate)).sql,
      values: [startDate],
    });
  });

  test('returns destination watermark predicate when startDate is omitted', () => {
    const destination = new S3TablesWarehouseDestination(
      'us-east-1',
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test'
    );
    const predicate = buildWarehouseSourcePredicate(makeSyncOptions({ destination }), tableSpec, namespace);
    const expected = buildMaxLastUpdatedWatermarkPredicate('iceberg_catalog.default.patient_history');

    assertDefined(predicate);
    expect(appendPredicateSql(predicate)).toStrictEqual(appendPredicateSql(expected));
  });

  test('ANDs destination watermark with startDate when both apply', () => {
    const startDate = '2024-06-01T00:00:00.000Z';
    const destination = new S3TablesWarehouseDestination(
      'us-east-1',
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test'
    );
    const predicate = buildWarehouseSourcePredicate(makeSyncOptions({ destination, startDate }), tableSpec, namespace);

    assertDefined(predicate);
    expect(appendPredicateSql(predicate)).toStrictEqual({
      sql: `(((SELECT MAX(last_updated) FROM "iceberg_catalog"."default"."patient_history") IS NULL OR "lastUpdated" > (SELECT MAX(last_updated) FROM "iceberg_catalog"."default"."patient_history")) AND "lastUpdated" >= $1)`,
      values: [startDate],
    });
  });
});
