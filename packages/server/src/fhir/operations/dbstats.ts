// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-stats',
  status: 'active',
  kind: 'operation',
  code: 'db-stats',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'tableNames',
      type: 'string',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'tableString',
      type: 'string',
      min: 1,
      max: '1',
    },
  ],
};

export async function dbStatsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ tableNames?: string }>(operation, req);

  const client = getDatabasePool(DatabaseMode.WRITER);

  const tableNames = params.tableNames?.split(',').map((name) => name.trim());

  const sql = `SELECT * FROM (
    SELECT
      i.relname AS table_name,
      pg_total_relation_size(i.relid) AS raw_size,
      pg_size_pretty(pg_total_relation_size(i.relid)) AS total_size,
      pg_size_pretty(pg_relation_size(i.relid)) AS table_size,
      pg_size_pretty(pg_indexes_size(i.relid)) AS all_indexes_size,
      reltuples::bigint AS estimated_row_count,
      indexrelname AS index_name,
      pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
      i.idx_scan AS index_scans,
      i.idx_tup_read AS index_entries_read,
      i.idx_tup_fetch AS index_rows_fetched,
      c.reloptions AS table_level_overrides,
      n_live_tup AS live_tuples,
      n_dead_tup AS dead_tuples,
      last_autovacuum,
      last_autoanalyze,
      last_analyze,
      last_vacuum,
      indisvalid
    FROM
      pg_stat_user_indexes i
      JOIN pg_class c ON i.relid = c.oid
      JOIN pg_stat_user_tables u ON i.relname = u.relname
      JOIN pg_index x ON i.indexrelid = x.indexrelid
    ${tableNames ? 'WHERE i.relname = ANY($1::text[])' : ''}
  ) t
  WHERE raw_size > 0
  ORDER BY raw_size DESC, table_name ASC`;

  const results = await client.query(sql, tableNames ? [tableNames] : undefined);

  let currentTable = '';
  const output: string[] = [];
  for (const row of results.rows) {
    if (row.table_name !== currentTable) {
      output.push(
        `${row.table_name}: ${row.total_size}`,
        `  [table_size: ${row.table_size} indexes_size: ${row.all_indexes_size}]`,
        `  [estimated_row_count: ${row.estimated_row_count}]`,
        `  [table_level_overrides: ${row.table_level_overrides}]`,
        `  [live_tuples: ${row.live_tuples}]`,
        `  [dead_tuples: ${row.dead_tuples}]`,
        `  [last_autovacuum: ${new Date(row.last_autovacuum).toISOString()}]`,
        `  [last_autoanalyze: ${new Date(row.last_autoanalyze).toISOString()}]`,
        `  [last_analyze: ${new Date(row.last_analyze).toISOString()}]`,
        `  [last_vacuum: ${new Date(row.last_vacuum).toISOString()}]`
      );
      currentTable = row.table_name;
    }
    output.push(
      `    ${row.index_name}: ${row.index_size}`,
      row.indisvalid
        ? `      [scans: ${row.index_scans} entries_read: ${row.index_entries_read} rows_fetched: ${row.index_rows_fetched}]`
        : `      [!INVALID!]`
    );
  }

  return [allOk, buildOutputParameters(operation, { tableString: output.join('\n') })];
}
