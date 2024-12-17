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
  code: 'status',
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
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
      i.idx_scan AS index_scans,
      i.idx_tup_read AS index_entries_read,
      i.idx_tup_fetch AS index_rows_fetched,
      c.reloptions AS table_level_overrides,
      n_live_tup AS live_tuples,
      n_dead_tup AS dead_tuples,
      last_autovacuum,
      last_autoanalyze
    FROM pg_stat_user_indexes i JOIN pg_class c ON i.relid = c.oid JOIN pg_stat_user_tables u ON i.relname = u.relname
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
        `  [table: ${row.table_size} indexes: ${row.all_indexes_size}]`,
        `  [estimated rows: ${row.estimated_row_count}]`,
        `  [settings overrides: ${row.table_level_overrides}]`,
        `  [live tuples: ${row.live_tuples}]`,
        `  [dead tuples: ${row.dead_tuples}]`,
        `  [last autovacuum: ${new Date(row.last_autovacuum).toISOString()}]`,
        `  [last autoanalyze: ${new Date(row.last_autoanalyze).toISOString()}]`
      );
      currentTable = row.table_name;
    }
    output.push(
      `    ${row.index_name}: ${row.index_size}`,
      `      [scans: ${row.index_scans} entries read: ${row.index_entries_read} rows fetched: ${row.index_rows_fetched}]`
    );
  }

  return [allOk, buildOutputParameters(operation, { tableString: output.join('\n') })];
}
