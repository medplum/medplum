// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { vi } from 'vitest';
import type { Expression } from '../fhir/sql';
import { Condition, SqlBuilder } from '../fhir/sql';
import type { DataWarehouseDestination } from './destination';
import { LocalParquetWarehouseDestination } from './destination';
import type { SyncOptions } from './sync';
import { buildWarehouseSourcePredicate } from './sync';
import { buildStartDatePredicate } from './warehouse-sql';

const tableSpec = { postgresTable: 'Patient_History', icebergTable: 'patient_history' };
const namespace = 'default';
const connection = {} as never;

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
  test('returns undefined when destination has no predicate and startDate is omitted', async () => {
    const destination = new LocalParquetWarehouseDestination('/tmp/dw-sync-test');
    const predicate = await buildWarehouseSourcePredicate(
      connection,
      makeSyncOptions({ destination }),
      tableSpec,
      namespace
    );
    expect(predicate).toBeUndefined();
  });

  test('returns startDate predicate only when destination has no predicate', async () => {
    const startDate = '2024-01-01T00:00:00.000Z';
    const destination = new LocalParquetWarehouseDestination('/tmp/dw-sync-test');
    const predicate = await buildWarehouseSourcePredicate(
      connection,
      makeSyncOptions({ destination, startDate }),
      tableSpec,
      namespace
    );

    assertDefined(predicate);
    expect(appendPredicateSql(predicate)).toStrictEqual({
      sql: appendPredicateSql(buildStartDatePredicate(startDate)).sql,
      values: [startDate],
    });
  });

  test('returns destination watermark predicate when startDate is omitted', async () => {
    const watermark = '2024-06-01T12:00:00.000Z';
    const destinationPredicate = new Condition('lastUpdated', '>', watermark);
    const destination = new LocalParquetWarehouseDestination('/tmp/dw-sync-test') as DataWarehouseDestination;
    vi.spyOn(destination, 'buildSourcePredicate').mockResolvedValue(destinationPredicate);

    const predicate = await buildWarehouseSourcePredicate(
      connection,
      makeSyncOptions({ destination }),
      tableSpec,
      namespace
    );

    assertDefined(predicate);
    expect(appendPredicateSql(predicate)).toStrictEqual(appendPredicateSql(destinationPredicate));
  });

  test('ANDs destination watermark with startDate when both apply', async () => {
    const startDate = '2024-06-01T00:00:00.000Z';
    const watermark = '2024-06-01T12:00:00.000Z';
    const destinationPredicate = new Condition('lastUpdated', '>', watermark);
    const destination = new LocalParquetWarehouseDestination('/tmp/dw-sync-test') as DataWarehouseDestination;
    vi.spyOn(destination, 'buildSourcePredicate').mockResolvedValue(destinationPredicate);

    const predicate = await buildWarehouseSourcePredicate(
      connection,
      makeSyncOptions({ destination, startDate }),
      tableSpec,
      namespace
    );

    assertDefined(predicate);
    expect(appendPredicateSql(predicate)).toStrictEqual({
      sql: `("lastUpdated" > $1 AND "lastUpdated" >= $2)`,
      values: [watermark, startDate],
    });
  });
});
