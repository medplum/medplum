// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { systemResourceProjectId } from '../constants';
import { Condition, Conjunction, Constant, SqlBuilder } from '../fhir/sql';
import type { DuckdbConnection } from './warehouse-sql';
import {
  buildInsertIntoSelectQuery,
  buildProjectedSelectFromHistoryTable,
  buildSelectFromHistoryTableQuery,
  buildStartDatePredicate,
  fetchIcebergWatermark,
} from './warehouse-sql';

const PROJECT_ID_SELECT = `COALESCE(json_extract_string("src"."content"::JSON, '$.meta.project'), '${systemResourceProjectId}') AS "project_id"`;

describe('warehouse SQL query builders', () => {
  test('buildProjectedSelectFromHistoryTableQueryWithSubquery keeps json_extract_string in outer DuckDB layer', () => {
    const sourcePredicate = new Constant(`"lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z'`);
    const query = buildSelectFromHistoryTableQuery('Patient_History', sourcePredicate);
    const sql = new SqlBuilder();
    sql.appendExpression(query);

    expect(sql.toString()).toBe(
      `SELECT "src"."id", "src"."version_id", "src"."content", "src"."last_updated", ${PROJECT_ID_SELECT} FROM (SELECT "pg_db"."Patient_History"."id", "pg_db"."Patient_History"."versionId" AS "version_id", "pg_db"."Patient_History"."content", "pg_db"."Patient_History"."lastUpdated" AS "last_updated" FROM "pg_db"."Patient_History" WHERE ("pg_db"."Patient_History"."content" IS NOT NULL AND "pg_db"."Patient_History"."content" <> $1 AND "lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z')) AS "src"`
    );
    expect(sql.getValues()).toStrictEqual(['']);
  });

  test('buildInsertIntoSelectQuery with subquery projection builds insert-select SQL', () => {
    const projectedSelectQuery = buildSelectFromHistoryTableQuery('Patient_History');
    const insertQuery = buildInsertIntoSelectQuery('iceberg_catalog.default.patient_history', projectedSelectQuery);
    expect(insertQuery.toString()).toBe(
      `INSERT INTO "iceberg_catalog"."default"."patient_history" ("id", "version_id", "content", "last_updated", "project_id") SELECT "src"."id", "src"."version_id", "src"."content", "src"."last_updated", ${PROJECT_ID_SELECT} FROM (SELECT "pg_db"."Patient_History"."id", "pg_db"."Patient_History"."versionId" AS "version_id", "pg_db"."Patient_History"."content", "pg_db"."Patient_History"."lastUpdated" AS "last_updated" FROM "pg_db"."Patient_History" WHERE ("pg_db"."Patient_History"."content" IS NOT NULL AND "pg_db"."Patient_History"."content" <> $1)) AS "src"`
    );
    expect(insertQuery.getValues()).toStrictEqual(['']);
  });

  test('buildProjectedSelectFromHistoryTable accepts source table strings directly', () => {
    const projected = buildProjectedSelectFromHistoryTable('Patient-history');
    expect(projected.toString()).toContain('FROM "pg_db"."Patient-history"');
    expect(projected.getValues()).toStrictEqual(['']);
  });

  test('buildProjectedSelectFromHistoryTable qualifies schema-prefixed source tables', () => {
    const projected = buildProjectedSelectFromHistoryTable('dw_worker_sync_int_test.history');
    expect(projected.toString()).toContain('FROM "pg_db"."dw_worker_sync_int_test"."history"');
    expect(projected.getValues()).toStrictEqual(['']);
  });

  test('buildStartDatePredicate filters history rows at or after the bound', () => {
    const startDate = '2024-01-01T00:00:00.000Z';
    const startDateSql = new SqlBuilder();
    startDateSql.appendExpression(buildStartDatePredicate(startDate));
    expect(startDateSql.toString()).toBe(`"lastUpdated" >= $1`);
    expect(startDateSql.getValues()).toStrictEqual([startDate]);
  });

  test('fetchIcebergWatermark reads manifest upper_bounds without scanning Parquet', async () => {
    let preparedSql = '';
    const boundValues: unknown[] = [];
    const connection = {
      prepare: async (sql: string) => {
        preparedSql = sql;
        return {
          bindValue(index: number, value: unknown) {
            boundValues[index - 1] = value;
          },
          async runAndReadAll() {
            return { getRowObjectsJson: () => [{ watermark: '2024-06-01T12:00:00.000Z' }] };
          },
        };
      },
    } as DuckdbConnection;

    const watermark = await fetchIcebergWatermark(connection, 'iceberg_catalog.default.patient_history');
    expect(watermark).toBe('2024-06-01T12:00:00.000Z');
    expect(preparedSql).toBe(
      `SELECT max(try_cast(upper_bound AS TIMESTAMPTZ)) AS watermark FROM iceberg_column_stats($1) WHERE ("column_name" = $2 AND "status" <> $3 AND "upper_bound" IS NOT NULL AND "upper_bound" <> $4)`
    );
    expect(boundValues).toStrictEqual(['iceberg_catalog.default.patient_history', 'last_updated', 'DELETED', '']);
  });

  test('Conjunction ANDs resolved watermark and startDate filters', () => {
    const startDate = '2024-06-01T00:00:00.000Z';
    const watermark = '2024-06-01T12:00:00.000Z';
    const combinedSql = new SqlBuilder();
    combinedSql.appendExpression(
      new Conjunction([new Condition('lastUpdated', '>', watermark), buildStartDatePredicate(startDate)])
    );
    expect(combinedSql.toString()).toBe(`("lastUpdated" > $1 AND "lastUpdated" >= $2)`);
    expect(combinedSql.getValues()).toStrictEqual([watermark, startDate]);
  });
});
