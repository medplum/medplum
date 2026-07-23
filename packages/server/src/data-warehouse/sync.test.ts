// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { vi } from 'vitest';
import type { Expression } from '../fhir/sql';
import { Condition, SqlBuilder } from '../fhir/sql';
import type { WarehouseSourceTable } from './config';
import * as dataWarehouseConfig from './config';
import type { DataWarehouseDestination, DestinationQueryContext } from './destination';
import { LocalParquetWarehouseDestination } from './destination';
import type { SyncOptions } from './sync';
import { buildWarehouseSourcePredicate, syncData } from './sync';
import type { DuckdbConnection } from './warehouse-sql';
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

describe('syncData', () => {
  const patientSource: WarehouseSourceTable = {
    postgresTable: 'Patient_History',
    icebergTable: 'patient_history',
  };
  const observationSource: WarehouseSourceTable = {
    postgresTable: 'Observation_History',
    icebergTable: 'observation_history',
  };

  beforeEach(() => {
    // Attach queries are empty in these tests; stub URI build so database config is not required.
    vi.spyOn(dataWarehouseConfig, 'buildPgConnectionURI').mockReturnValue('postgresql://unused');
  });

  test('skips a table on Iceberg Conflict 409 and continues with remaining tables', async () => {
    // given
    const onProgress = vi.fn();
    const destination = createFakeDestination({
      writeRows: async (_connection: DuckdbConnection, context: DestinationQueryContext) => {
        if (context.tableSpec.icebergTable === patientSource.icebergTable) {
          throw new Error('HTTP 409 Conflict 409: commit conflict during compaction');
        }
        return 3;
      },
    });

    // when
    const result = await syncData({
      database: {},
      warehouseSources: [patientSource, observationSource],
      destination,
      onProgress,
    });

    // then
    expect(result.tables).toHaveLength(2);
    expect(result.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: patientSource.icebergTable,
          status: 'skipped-conflict',
          rowsInserted: 0,
        }),
        expect.objectContaining({
          destination: observationSource.icebergTable,
          rowsInserted: 3,
        }),
      ])
    );
    expect(result.tables.find((t) => t.destination === observationSource.icebergTable)?.status).toBeUndefined();
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining(`Skipped ${patientSource.icebergTable}`),
      expect.objectContaining({
        destination: patientSource.icebergTable,
        rowsInserted: 0,
        tablesCompleted: 2,
        tablesTotal: 2,
      })
    );
  });

  test('skips a table on CommitFailedException and continues with remaining tables', async () => {
    // given
    const destination = createFakeDestination({
      writeRows: async (_connection: DuckdbConnection, context: DestinationQueryContext) => {
        if (context.tableSpec.icebergTable === observationSource.icebergTable) {
          throw new Error('CommitFailedException: concurrent commit');
        }
        return 2;
      },
    });

    // when
    const result = await syncData({
      database: {},
      warehouseSources: [patientSource, observationSource],
      destination,
    });

    // then
    expect(result.tables).toHaveLength(2);
    expect(result.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: patientSource.icebergTable,
          rowsInserted: 2,
        }),
        expect.objectContaining({
          destination: observationSource.icebergTable,
          status: 'skipped-conflict',
          rowsInserted: 0,
        }),
      ])
    );
    expect(result.tables.find((t) => t.destination === patientSource.icebergTable)?.status).toBeUndefined();
  });

  test('skips a table on watermark read failure and continues with remaining tables', async () => {
    // given
    const onProgress = vi.fn();
    const destination = createFakeDestination({
      buildSourcePredicate: async (_connection, tableSpec) => {
        if (tableSpec.icebergTable === patientSource.icebergTable) {
          throw new Error('iceberg_column_stats failed');
        }
        return undefined;
      },
      writeRows: async () => 5,
    });

    // when
    const result = await syncData({
      database: {},
      warehouseSources: [patientSource, observationSource],
      destination,
      onProgress,
    });

    // then
    expect(result.tables).toHaveLength(2);
    expect(result.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: patientSource.icebergTable,
          status: 'skipped-watermark',
          rowsInserted: 0,
          syncDurationMs: 0,
        }),
        expect.objectContaining({
          destination: observationSource.icebergTable,
          rowsInserted: 5,
        }),
      ])
    );
    expect(result.tables.find((t) => t.destination === observationSource.icebergTable)?.status).toBeUndefined();
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining(`Skipped ${patientSource.icebergTable}`),
      expect.objectContaining({
        destination: patientSource.icebergTable,
        rowsInserted: 0,
        tablesTotal: 2,
      })
    );
    // Progress reaches total even when a watermark was skipped.
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining(`table 2/2`),
      expect.objectContaining({ tablesCompleted: 2, tablesTotal: 2 })
    );
  });

  test('skips a table when destination target is missing and continues with remaining tables', async () => {
    // given
    const onProgress = vi.fn();
    const destination = createFakeDestination({
      ensureTargetExists: async (tableSpec) => {
        if (tableSpec.icebergTable === patientSource.icebergTable) {
          throw new Error('Managed Iceberg table does not exist: default.patient_history. Run migration before sync.');
        }
      },
      writeRows: async () => 4,
    });

    // when
    const result = await syncData({
      database: {},
      warehouseSources: [patientSource, observationSource],
      destination,
      onProgress,
    });

    // then
    expect(result.tables).toHaveLength(2);
    expect(result.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: patientSource.icebergTable,
          status: 'skipped-missing-table',
          rowsInserted: 0,
          syncDurationMs: 0,
        }),
        expect.objectContaining({
          destination: observationSource.icebergTable,
          rowsInserted: 4,
        }),
      ])
    );
    expect(result.tables.find((t) => t.destination === observationSource.icebergTable)?.status).toBeUndefined();
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining(`Skipped ${patientSource.icebergTable}`),
      expect.objectContaining({
        destination: patientSource.icebergTable,
        rowsInserted: 0,
        tablesTotal: 2,
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining('destination table missing'),
      expect.objectContaining({ destination: patientSource.icebergTable })
    );
  });

  test('skips a table on unexpected watermark setup failure and continues the worker stripe', async () => {
    // given — 9 sources so concurrency is 8 and worker 0 owns stripe [0, 8]
    const warehouseSources: WarehouseSourceTable[] = Array.from({ length: 9 }, (_, i) => ({
      postgresTable: `Resource${i}_History`,
      icebergTable: `resource${i}_history`,
    }));
    const failingTable = warehouseSources[8].icebergTable;
    let destinationNameCallsForFailing = 0;
    const onProgress = vi.fn();
    const destination = createFakeDestination({
      getDestinationName: (spec) => {
        if (spec.icebergTable === failingTable) {
          destinationNameCallsForFailing += 1;
          // Fail during watermark collection; later sync-loop calls must succeed for reporting.
          if (destinationNameCallsForFailing === 1) {
            throw new Error('watermark setup boom');
          }
        }
        return spec.icebergTable;
      },
      writeRows: async () => 1,
    });

    // when
    const result = await syncData({
      database: {},
      warehouseSources,
      destination,
      onProgress,
    });

    // then — failure on one stripe member does not drop the rest; all sources are reported
    expect(result.tables).toHaveLength(9);
    expect(result.tables.find((t) => t.destination === failingTable)).toEqual(
      expect.objectContaining({
        destination: failingTable,
        status: 'skipped-watermark',
        rowsInserted: 0,
      })
    );
    expect(result.tables.filter((t) => !t.status)).toHaveLength(8);
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining(`table 9/9`),
      expect.objectContaining({ tablesCompleted: 9, tablesTotal: 9 })
    );
  });
});

/**
 * Destination stub for syncData control-flow tests: empty setup/attach SQL so sync uses a real
 * DuckDB instance without Iceberg or Postgres, while predicate/write behavior stays injectable.
 * @param overrides - Optional overrides for ensureTargetExists, buildSourcePredicate, writeRows, and getDestinationName.
 * @returns A DataWarehouseDestination suitable for syncData unit tests.
 */
function createFakeDestination(
  overrides: Partial<{
    ensureTargetExists: DataWarehouseDestination['ensureTargetExists'];
    buildSourcePredicate: DataWarehouseDestination['buildSourcePredicate'];
    writeRows: DataWarehouseDestination['writeRows'];
    getDestinationName: DataWarehouseDestination['getDestinationName'];
  }> = {}
): DataWarehouseDestination {
  return {
    type: 'local',
    getSetupQueries: () => [],
    getConnectionSetupQueries: () => [],
    getPostgresAttachQueries: () => [],
    ensureTargetExists: overrides.ensureTargetExists ?? (async () => undefined),
    buildSourcePredicate: overrides.buildSourcePredicate ?? (async () => undefined),
    writeRows: overrides.writeRows ?? (async () => 1),
    getDestinationName: overrides.getDestinationName ?? ((spec: WarehouseSourceTable) => spec.icebergTable),
  };
}
