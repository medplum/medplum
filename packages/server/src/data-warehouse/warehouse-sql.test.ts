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
  const historyResourceJoin =
    'LEFT JOIN "pg_db"."Patient" AS "resource" ON "pg_db"."Patient_History"."id" = "resource"."id"';

  test('buildProjectedSelectFromHistoryTableQueryWithSubquery joins resource table for project_id', () => {
    const sourcePredicate = new Constant(
      `"pg_db"."Patient_History"."lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z'`
    );
    const query = buildSelectFromHistoryTableQuery('Patient_History', sourcePredicate);
    const sql = new SqlBuilder();
    sql.appendExpression(query);

    expect(sql.toString()).toBe(
      `SELECT "src"."id", "src"."version_id", "src"."content", "src"."last_updated", "src"."project_id" FROM (SELECT "pg_db"."Patient_History"."id", "pg_db"."Patient_History"."versionId" AS "version_id", "pg_db"."Patient_History"."content", "pg_db"."Patient_History"."lastUpdated" AS "last_updated", "resource"."projectId" AS "project_id" FROM "pg_db"."Patient_History" ${historyResourceJoin} WHERE "pg_db"."Patient_History"."lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z') AS "src" ORDER BY "src"."last_updated"`
    );
    expect(sql.getValues()).toStrictEqual([]);
  });

  test('buildInsertIntoSelectQuery with subquery projection builds insert-select SQL', () => {
    const projectedSelectQuery = buildSelectFromHistoryTableQuery('Patient_History');
    const insertQuery = buildInsertIntoSelectQuery('iceberg_catalog.default.patient_history', projectedSelectQuery);
    expect(insertQuery.toString()).toBe(
      `INSERT INTO "iceberg_catalog"."default"."patient_history" ("id", "version_id", "content", "last_updated", "project_id") SELECT "src"."id", "src"."version_id", "src"."content", "src"."last_updated", "src"."project_id" FROM (SELECT "pg_db"."Patient_History"."id", "pg_db"."Patient_History"."versionId" AS "version_id", "pg_db"."Patient_History"."content", "pg_db"."Patient_History"."lastUpdated" AS "last_updated", "resource"."projectId" AS "project_id" FROM "pg_db"."Patient_History" ${historyResourceJoin}) AS "src" ORDER BY "src"."last_updated"`
    );
    expect(insertQuery.getValues()).toStrictEqual([]);
  });

  test('buildProjectedSelectFromHistoryTable accepts source table strings directly', () => {
    const projected = buildProjectedSelectFromHistoryTable('CustomResource_History');
    expect(projected.toString()).toContain('FROM "pg_db"."CustomResource_History"');
    expect(projected.toString()).toContain('LEFT JOIN "pg_db"."CustomResource" AS "resource"');
    expect(projected.getValues()).toStrictEqual([]);
  });

  test('buildCountFromHistoryTableQuery builds count query for all history rows', () => {
    const countQuery = buildCountFromHistoryTableQuery('Patient_History');
    expect(countQuery.toString()).toBe(`SELECT COUNT(*) AS count FROM "pg_db"."Patient_History"`);
    expect(countQuery.getValues()).toStrictEqual([]);
  });

  test('buildMaxLastUpdatedWatermarkPredicate builds predicate from ORM subquery', () => {
    const watermarkSql = new SqlBuilder();
    watermarkSql.appendExpression(
      buildMaxLastUpdatedWatermarkPredicate('s3_tables_db.default.patient_history', 'Patient_History')
    );
    expect(watermarkSql.toString()).toBe(
      `((SELECT MAX(last_updated) FROM "s3_tables_db"."default"."patient_history") IS NULL OR "pg_db"."Patient_History"."lastUpdated" > (SELECT MAX(last_updated) FROM "s3_tables_db"."default"."patient_history"))`
    );
  });

  test('buildMaxLastUpdatedWatermarkPredicate rejects invalid qualified table identifiers', () => {
    expect(() => buildMaxLastUpdatedWatermarkPredicate('patient_history', 'Patient_History')).toThrow(
      'Invalid qualified table identifier: patient_history'
    );
  });

  test('buildStartDatePredicate filters history rows at or after the bound', () => {
    const startDate = '2024-01-01T00:00:00.000Z';
    const startDateSql = new SqlBuilder();
    startDateSql.appendExpression(buildStartDatePredicate(startDate, 'Patient_History'));
    expect(startDateSql.toString()).toBe(`"pg_db"."Patient_History"."lastUpdated" >= $1`);
    expect(startDateSql.getValues()).toStrictEqual([startDate]);
  });

  test('Conjunction ANDs watermark and startDate filters', () => {
    const startDate = '2024-06-01T00:00:00.000Z';
    const combinedSql = new SqlBuilder();
    combinedSql.appendExpression(
      new Conjunction([
        buildMaxLastUpdatedWatermarkPredicate('iceberg_catalog.default.patient_history', 'Patient_History'),
        buildStartDatePredicate(startDate, 'Patient_History'),
      ])
    );
    expect(combinedSql.toString()).toBe(
      `(((SELECT MAX(last_updated) FROM "iceberg_catalog"."default"."patient_history") IS NULL OR "pg_db"."Patient_History"."lastUpdated" > (SELECT MAX(last_updated) FROM "iceberg_catalog"."default"."patient_history")) AND "pg_db"."Patient_History"."lastUpdated" >= $1)`
    );
    expect(combinedSql.getValues()).toStrictEqual([startDate]);
  });
});
