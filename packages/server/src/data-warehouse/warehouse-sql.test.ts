// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Conjunction, Constant, SqlBuilder } from '../fhir/sql';
import {
  buildCountFromHistoryTableQuery,
  buildInsertIntoSelectQuery,
  buildMaxLastUpdatedWatermarkPredicate,
  buildProjectedSelectFromHistoryTable,
  buildSelectFromHistoryTableQuery,
  buildStartDatePredicate,
} from './warehouse-sql';

describe('warehouse SQL query builders', () => {
  test('buildProjectedSelectFromHistoryTableQueryWithSubquery keeps json_extract_string in outer DuckDB layer', () => {
    const sourcePredicate = new Constant(`"lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z'`);
    const query = buildSelectFromHistoryTableQuery('Patient_history', sourcePredicate);
    const sql = new SqlBuilder();
    sql.appendExpression(query);

    expect(sql.toString()).toBe(
      `SELECT "src"."id", "src"."version_id", "src"."content", "src"."last_updated", json_extract_string("src"."content"::JSON, '$.meta.project') AS project_id FROM (SELECT "pg_db"."Patient_history"."id", "pg_db"."Patient_history"."versionId" AS "version_id", "pg_db"."Patient_history"."content", "pg_db"."Patient_history"."lastUpdated" AS "last_updated" FROM "pg_db"."Patient_history" WHERE ("pg_db"."Patient_history"."content" IS NOT NULL AND "pg_db"."Patient_history"."content" <> $1 AND "lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z') ORDER BY "pg_db"."Patient_history"."lastUpdated") AS "src"`
    );
    expect(sql.getValues()).toStrictEqual(['']);
  });

  test('buildInsertIntoSelectQuery with subquery projection builds insert-select SQL', () => {
    const projectedSelectQuery = buildSelectFromHistoryTableQuery('Patient_history');
    const insertQuery = buildInsertIntoSelectQuery('iceberg_catalog.default.patient_history', projectedSelectQuery);
    expect(insertQuery.toString()).toBe(
      `INSERT INTO "iceberg_catalog"."default"."patient_history" ("id", "version_id", "content", "last_updated", "project_id") SELECT "src"."id", "src"."version_id", "src"."content", "src"."last_updated", json_extract_string("src"."content"::JSON, '$.meta.project') AS project_id FROM (SELECT "pg_db"."Patient_history"."id", "pg_db"."Patient_history"."versionId" AS "version_id", "pg_db"."Patient_history"."content", "pg_db"."Patient_history"."lastUpdated" AS "last_updated" FROM "pg_db"."Patient_history" WHERE ("pg_db"."Patient_history"."content" IS NOT NULL AND "pg_db"."Patient_history"."content" <> $1) ORDER BY "pg_db"."Patient_history"."lastUpdated") AS "src"`
    );
    expect(insertQuery.getValues()).toStrictEqual(['']);
  });

  test('buildProjectedSelectFromHistoryTable accepts source table strings directly', () => {
    const projected = buildProjectedSelectFromHistoryTable('Patient-history');
    expect(projected.toString()).toContain('FROM "pg_db"."Patient-history"');
    expect(projected.getValues()).toStrictEqual(['']);
  });

  test('buildCountFromHistoryTableQuery builds count query with guarded content filter', () => {
    const countQuery = buildCountFromHistoryTableQuery('Patient_history');
    expect(countQuery.toString()).toBe(
      `SELECT COUNT(*) AS count FROM "pg_db"."Patient_history" WHERE ("pg_db"."Patient_history"."content" IS NOT NULL AND "pg_db"."Patient_history"."content" <> $1)`
    );
    expect(countQuery.getValues()).toStrictEqual(['']);
  });

  test('buildMaxLastUpdatedWatermarkPredicate builds predicate from ORM subquery', () => {
    const watermarkSql = new SqlBuilder();
    watermarkSql.appendExpression(buildMaxLastUpdatedWatermarkPredicate('s3_tables_db.default.patient_history'));
    expect(watermarkSql.toString()).toBe(
      `((SELECT MAX(last_updated) FROM "s3_tables_db"."default"."patient_history") IS NULL OR "lastUpdated" > (SELECT MAX(last_updated) FROM "s3_tables_db"."default"."patient_history"))`
    );
  });

  test('buildMaxLastUpdatedWatermarkPredicate rejects invalid qualified table identifiers', () => {
    expect(() => buildMaxLastUpdatedWatermarkPredicate('patient_history')).toThrow(
      'Invalid qualified table identifier: patient_history'
    );
  });

  test('buildStartDatePredicate filters history rows at or after the bound', () => {
    const startDate = '2024-01-01T00:00:00.000Z';
    const startDateSql = new SqlBuilder();
    startDateSql.appendExpression(buildStartDatePredicate(startDate));
    expect(startDateSql.toString()).toBe(`"lastUpdated" >= $1`);
    expect(startDateSql.getValues()).toStrictEqual([startDate]);
  });

  test('Conjunction ANDs watermark and startDate filters', () => {
    const startDate = '2024-06-01T00:00:00.000Z';
    const combinedSql = new SqlBuilder();
    combinedSql.appendExpression(
      new Conjunction([
        buildMaxLastUpdatedWatermarkPredicate('iceberg_catalog.default.patient_history'),
        buildStartDatePredicate(startDate),
      ])
    );
    expect(combinedSql.toString()).toBe(
      `(((SELECT MAX(last_updated) FROM "iceberg_catalog"."default"."patient_history") IS NULL OR "lastUpdated" > (SELECT MAX(last_updated) FROM "iceberg_catalog"."default"."patient_history")) AND "lastUpdated" >= $1)`
    );
    expect(combinedSql.getValues()).toStrictEqual([startDate]);
  });
});
