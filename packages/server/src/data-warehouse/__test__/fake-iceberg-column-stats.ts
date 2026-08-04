// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Mock DuckDB function for the Iceberg extension's `iceberg_column_stats` table function.
 *
 * Column shape matches what `fetchIcebergWatermark` reads from the live output.
 *
 * @param watermarkByQualifiedTable - Map of fully qualified Iceberg table name → last_updated upper_bound.
 * @returns SQL statements to create the fixture table and macro (run before watermark reads).
 */
export function buildFakeIcebergColumnStatsSetupQueries(watermarkByQualifiedTable: Record<string, string>): string[] {
  const values = Object.entries(watermarkByQualifiedTable)
    .map(([table, upperBound]) => `('${table}', '${upperBound}')`)
    .join(',\n      ');

  return [
    `CREATE OR REPLACE TABLE iceberg_column_stats_fixture (
      table_name VARCHAR,
      upper_bound VARCHAR
    )`,
    `INSERT INTO iceberg_column_stats_fixture VALUES
      ${values}`,
    `CREATE OR REPLACE MACRO iceberg_column_stats(qualified_table) AS TABLE
      SELECT
        'ADDED' AS status,
        'last_updated' AS column_name,
        upper_bound
      FROM iceberg_column_stats_fixture f
      WHERE f.table_name = qualified_table`,
  ];
}
