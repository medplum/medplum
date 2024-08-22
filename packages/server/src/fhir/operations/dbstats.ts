import { allOk } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { buildOutputParameters } from './utils/parameters';

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
  parameter: [{ use: 'out', name: 'tableString', type: 'string', min: 1, max: '1' }],
};

export async function dbStatsHandler(_req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const client = getDatabasePool(DatabaseMode.WRITER);
  const sql = `SELECT * FROM (
    SELECT
      i.relname AS table_name,
      pg_total_relation_size(relid) AS raw_size,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_size_pretty(pg_relation_size(relid)) AS table_size,
      pg_size_pretty(pg_indexes_size(relid)) AS all_indexes_size,
      reltuples::bigint AS estimated_row_count,
      indexrelname AS index_name,
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
      idx_scan AS index_scans,
      idx_tup_read AS index_entries_read,
      idx_tup_fetch AS index_rows_fetched
    FROM pg_stat_user_indexes i JOIN pg_class c ON i.relid = c.oid
  ) t
  WHERE raw_size > 0
  ORDER BY raw_size DESC, table_name ASC`;

  const results = await client.query(sql);

  let currentTable = '';
  const output: string[] = [];
  for (const row of results.rows) {
    if (row.table_name !== currentTable) {
      output.push(
        `${row.table_name}: ${row.total_size}`,
        `  [table: ${row.table_size} indexes: ${row.all_indexes_size}]`,
        `  [estimated rows: ${row.estimated_row_count}]`
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
