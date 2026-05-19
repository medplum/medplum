// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { SqlBuilder } from '../fhir/sql';
import {
  buildCountFromHistoryTableQuery,
  buildInsertIntoSelectQuery,
  buildMaxLastUpdatedWatermarkPredicate,
  buildProjectedSelectFromHistoryTable,
  buildProjectedSelectFromHistoryTableQuery,
} from './warehouse-sql';

describe('warehouse SQL query builders', () => {
  test('buildProjectedSelectFromHistoryTableQuery uses SelectQuery to build projected history SQL', () => {
    const whereClause = `"lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z'`;
    const query = buildProjectedSelectFromHistoryTableQuery('Patient_history', whereClause);
    const sql = new SqlBuilder();
    sql.appendExpression(query);

    expect(sql.toString()).toBe(
      `SELECT "pg_db"."Patient_history"."id", "pg_db"."Patient_history"."versionId" AS "version_id", "pg_db"."Patient_history"."content", "pg_db"."Patient_history"."lastUpdated" AS "last_updated", json_extract_string(content, '$.meta.project') AS project_id FROM "pg_db"."Patient_history" WHERE ("pg_db"."Patient_history"."content" IS NOT NULL AND "pg_db"."Patient_history"."content" != '' AND ("lastUpdated" > TIMESTAMPTZ '2024-01-01T00:00:00.000Z')) ORDER BY "pg_db"."Patient_history"."lastUpdated"`
    );
  });

  test('buildProjectedSelectFromHistoryTable accepts source table strings directly', () => {
    expect(buildProjectedSelectFromHistoryTable('Patient-history', 'TRUE')).toContain('FROM "pg_db"."Patient-history"');
  });

  test('buildCountFromHistoryTableQuery builds count query with guarded content filter', () => {
    expect(buildCountFromHistoryTableQuery('Patient_history', `TRUE`)).toBe(
      `SELECT COUNT(*) AS count FROM "pg_db"."Patient_history" WHERE ("pg_db"."Patient_history"."content" IS NOT NULL AND "pg_db"."Patient_history"."content" != '' AND (TRUE));`
    );
  });

  test('buildInsertIntoSelectQuery uses InsertQuery for insert-select SQL', () => {
    const projectedSelectQuery = buildProjectedSelectFromHistoryTableQuery('Patient_history', 'TRUE');
    expect(buildInsertIntoSelectQuery('s3_tables_db.default.patient_history', projectedSelectQuery)).toBe(
      `INSERT INTO "s3_tables_db"."default"."patient_history" ("id", "version_id", "content", "last_updated", "project_id") SELECT "pg_db"."Patient_history"."id", "pg_db"."Patient_history"."versionId" AS "version_id", "pg_db"."Patient_history"."content", "pg_db"."Patient_history"."lastUpdated" AS "last_updated", json_extract_string(content, '$.meta.project') AS project_id FROM "pg_db"."Patient_history" WHERE ("pg_db"."Patient_history"."content" IS NOT NULL AND "pg_db"."Patient_history"."content" != '' AND (TRUE)) ORDER BY "pg_db"."Patient_history"."lastUpdated";`
    );
  });

  test('buildMaxLastUpdatedWatermarkPredicate builds predicate from ORM subquery', () => {
    expect(buildMaxLastUpdatedWatermarkPredicate('s3_tables_db.default.patient_history')).toBe(
      `((SELECT MAX(last_updated) FROM "s3_tables_db"."default"."patient_history") IS NULL OR "lastUpdated" > (SELECT MAX(last_updated) FROM "s3_tables_db"."default"."patient_history"))`
    );
  });

  test('buildMaxLastUpdatedWatermarkPredicate rejects invalid qualified table identifiers', () => {
    expect(() => buildMaxLastUpdatedWatermarkPredicate('patient_history')).toThrow(
      'Invalid qualified table identifier: patient_history'
    );
  });
});
