// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { buildOutputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-invalid-indexes',
  status: 'active',
  kind: 'operation',
  code: 'db-invalid-indexes',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'out',
      name: 'invalidIndex',
      type: 'string',
      min: 0,
      max: '*',
    },
  ],
};

export async function dbInvalidIndexesHandler(_req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const sql = `SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    i.indexrelid::regclass AS index_name,
    i.indisvalid AS is_valid,
    i.indisready AS is_ready,
    i.indislive AS is_live,
    pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
    pg_size_pretty(pg_relation_size(i.indrelid)) AS table_size,
    am.amname AS index_type,
    i.indisprimary AS is_primary,
    i.indisunique AS is_unique,
    array_to_string(i.indkey, ' ') AS column_positions,
    pg_get_indexdef(i.indexrelid) AS index_definition,
    s.idx_scan AS index_scans,
    s.idx_tup_read AS tuples_read,
    s.idx_tup_fetch AS tuples_fetched,
    age(c2.relfrozenxid) AS index_age,
    c2.reltuples::bigint AS estimated_rows,
    CASE 
        WHEN i.indisvalid AND i.indisready AND i.indislive THEN 'Healthy'
        WHEN NOT i.indisvalid AND i.indisready AND i.indislive THEN 'Invalid but maintained'
        WHEN NOT i.indisready THEN 'Building/Not ready'
        WHEN NOT i.indislive THEN 'Not maintained'
        ELSE 'Unknown state'
    END AS index_status
FROM
    pg_index i
JOIN
    pg_class c ON i.indrelid = c.oid
JOIN
    pg_class c2 ON i.indexrelid = c2.oid
JOIN
    pg_namespace n ON c.relnamespace = n.oid
JOIN
    pg_am am ON c2.relam = am.oid
LEFT JOIN
    pg_stat_all_indexes s ON s.indexrelid = i.indexrelid
WHERE
    (NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive)
ORDER BY
    n.nspname, c.relname, i.indexrelid::regclass`;

  const client = getDatabasePool(DatabaseMode.WRITER);
  const results = await client.query<{
    schema_name: string;
    table_name: string;
    index_name: string;
    is_valid: boolean;
    is_ready: boolean;
    is_live: boolean;
    index_size: string;
    table_size: string;
    index_type: string;
    is_primary: boolean;
    is_unique: boolean;
    column_positions: string;
    index_definition: string;
    index_scans: number;
    tuples_read: number;
    tuples_fetched: number;
    index_age: string;
    estimated_rows: number;
    index_status: string;
  }>(sql);

  const output: string[] = [];
  for (const row of results.rows) {
    output.push(
      [
        `${row.index_name}:`,
        `  [schema: ${row.schema_name}]`,
        `  [table: ${row.table_name}]`,
        `  [index_status: ${row.index_status}]`,
        `  [is_valid: ${row.is_valid}]`,
        `  [is_ready: ${row.is_ready}]`,
        `  [is_live: ${row.is_live}]`,
        `  [index_size: ${row.index_size}]`,
        `  [table_size: ${row.table_size}]`,
        `  [index_type: ${row.index_type}]`,
        `  [is_primary: ${row.is_primary}]`,
        `  [is_unique: ${row.is_unique}]`,
        `  [column_positions: ${row.column_positions}]`,
        `  [index_definition: ${row.index_definition}]`,
        `  [index_scans: ${row.index_scans}]`,
        `  [tuples_read: ${row.tuples_read}]`,
        `  [tuples_fetched: ${row.tuples_fetched}]`,
        `  [index_age: ${row.index_age}]`,
        `  [estimated_rows: ${row.estimated_rows}]`,
      ].join('\n')
    );
  }

  return [allOk, buildOutputParameters(operation, { invalidIndex: output })];
}
