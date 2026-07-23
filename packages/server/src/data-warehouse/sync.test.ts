// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { DuckDBInstance } from '@duckdb/node-api';
import type { MockInstance } from 'vitest';
import { vi } from 'vitest';
import type { Expression } from '../fhir/sql';
import { Condition, SqlBuilder } from '../fhir/sql';
import * as otelModule from '../otel/otel';
import type { DataWarehouseDestination } from './destination';
import { LocalParquetWarehouseDestination } from './destination';
import type { SyncOptions } from './sync';
import { buildWarehouseSourcePredicate, syncData } from './sync';
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

describe('syncData OpenTelemetry metrics', () => {
  let createSpy: MockInstance<(typeof DuckDBInstance)['create']>;
  let recordHistogramValueSpy: MockInstance<typeof otelModule.recordHistogramValue>;
  let incrementCounterSpy: MockInstance<typeof otelModule.incrementCounter>;

  beforeEach(() => {
    const duckConnection = {
      run: vi.fn().mockResolvedValue(undefined),
      closeSync: vi.fn(),
    };
    createSpy = vi.spyOn(DuckDBInstance, 'create').mockResolvedValue({
      connect: vi.fn().mockResolvedValue(duckConnection),
      closeSync: vi.fn(),
    } as never);
    recordHistogramValueSpy = vi.spyOn(otelModule, 'recordHistogramValue').mockImplementation(() => true);
    incrementCounterSpy = vi.spyOn(otelModule, 'incrementCounter').mockImplementation(() => true);
  });

  afterEach(() => {
    createSpy.mockRestore();
    recordHistogramValueSpy.mockRestore();
    incrementCounterSpy.mockRestore();
  });

  function makeMockDestination(rowsInserted: number): DataWarehouseDestination {
    return {
      type: 'local',
      getSetupQueries: () => [],
      getPostgresAttachQueries: () => [],
      ensureTargetExists: vi.fn().mockResolvedValue(undefined),
      buildSourcePredicate: vi.fn().mockResolvedValue(undefined),
      writeRows: vi.fn().mockResolvedValue(rowsInserted),
      getDestinationName: (spec) => spec.icebergTable,
    };
  }

  test('records table sync histograms and counters', async () => {
    const destination = makeMockDestination(5);

    const result = await syncData(
      makeSyncOptions({
        destination,
        database: { host: 'localhost', port: 5432, dbname: 'medplum', username: 'medplum', password: 'medplum' },
      })
    );

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]).toMatchObject({
      destination: 'patient_history',
      rowsInserted: 5,
    });

    const attrs = { attributes: { table: 'patient_history' } };
    expect(recordHistogramValueSpy).toHaveBeenCalledWith(
      'medplum.datawarehouse.table.syncDuration',
      expect.any(Number),
      attrs
    );
    expect(recordHistogramValueSpy).toHaveBeenCalledWith(
      'medplum.datawarehouse.table.watermarkDuration',
      expect.any(Number),
      attrs
    );
    expect(recordHistogramValueSpy).toHaveBeenCalledWith('medplum.datawarehouse.table.rowsInserted', 5, attrs);
    expect(incrementCounterSpy).toHaveBeenCalledWith('medplum.datawarehouse.table.count', attrs);
  });
});
