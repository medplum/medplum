// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { escapeUnicode } from '../../migrations/migrate-utils';
import { isValidTableName, SqlBuilder } from '../sql';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-gin-indexes',
  status: 'active',
  kind: 'operation',
  code: 'db-gin-indexes',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'tableName',
      type: 'string',
      min: 0,
      max: '*',
    },
    {
      use: 'out',
      name: 'defaultGinPendingListLimit',
      type: 'integer',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'index',
      min: 0,
      max: '*',
      part: [
        { use: 'out', name: 'tableName', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'indexName', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'indexOptions', type: 'string', min: 0, max: '1' },
        { use: 'out', name: 'fastUpdate', type: 'boolean', min: 1, max: '1' },
        { use: 'out', name: 'ginPendingListLimit', type: 'integer', min: 0, max: '1' },
        { use: 'out', name: 'bytesPending', type: 'integer', min: 1, max: '1' },
        { use: 'out', name: 'pendingHead', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'pendingTail', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'tailFreeSize', type: 'integer', min: 1, max: '1' },
        { use: 'out', name: 'nPendingPages', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'nPendingTuples', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'nTotalPages', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'nEntryPages', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'nDataPages', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'nEntries', type: 'string', min: 1, max: '1' },
        { use: 'out', name: 'version', type: 'integer', min: 1, max: '1' },
      ],
    },
  ],
};

interface GinIndexInfo {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexOptions?: string;
  fastUpdate: boolean;
  ginPendingListLimit?: number;
}

export async function dbGinIndexesHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ tableName?: string }>(operation, req);

  const tableNames = [];
  for (const tableName of params.tableName?.split(',').map((name) => name.trim()) ?? []) {
    if (!isValidTableName(tableName)) {
      throw new OperationOutcomeError(badRequest('Invalid tableName'));
    }
    tableNames.push(tableName);
  }

  const defaultGinPendingListLimit = await getDefaultGinPendingListLimit();
  const client = getDatabasePool(DatabaseMode.WRITER);

  let index: GinIndexInfo[] | undefined;
  if (tableNames.length > 0) {
    index = await getGinIndexInfo(client, tableNames);
  }
  const output: { defaultGinPendingListLimit: number; index?: GinIndexInfo[] } = {
    defaultGinPendingListLimit,
    index,
  };

  return [allOk, buildOutputParameters(operation, output)];
}

async function getDefaultGinPendingListLimit(): Promise<number> {
  const client = getDatabasePool(DatabaseMode.WRITER);
  const defaultStatisticsTarget = await client.query('SELECT setting FROM pg_settings WHERE name = $1', [
    'gin_pending_list_limit',
  ]);
  return Number(defaultStatisticsTarget.rows[0].setting);
}

async function getGinIndexInfo(client: PoolClient | Pool, tableNames: string[]): Promise<GinIndexInfo[]> {
  const schemaName = 'public';
  const builder = new SqlBuilder();
  const sql = `SELECT
    n.nspname as "schemaName",
    t.relname as "tableName",
    i.relname as "indexName",
    i.reloptions as "indexOptions",
    coalesce((SELECT (regexp_matches(coalesce(quote_ident(opt), ''), 'fastupdate=(\\w+)'))[1]::boolean FROM unnest(coalesce(i.reloptions, '{}')) AS opt
      WHERE opt ~ '^fastupdate='), TRUE) AS "fastUpdate",
		(SELECT (regexp_matches(coalesce(quote_ident(opt), ''), 'gin_pending_list_limit=(\\d+)'))[1]::INT FROM unnest(coalesce(i.reloptions, '{}')) AS opt
      WHERE opt ~ '^gin_pending_list_limit=') AS "ginPendingListLimit",
    gm.n_pending_pages::int * current_setting('block_size')::int as "bytesPending",
		gm.pending_head as "pendingHead",
		gm.pending_tail as "pendingTail",
		gm.tail_free_size as "tailFreeSize",
		gm.n_pending_pages as "nPendingPages",
		gm.n_pending_tuples as "nPendingTuples",
		gm.n_total_pages as "nTotalPages",
		gm.n_entry_pages as "nEntryPages",
		gm.n_data_pages as "nDataPages",
		gm.n_entries as "nEntries",
		gm.version as "version"
    FROM pg_index ix
    JOIN pg_class i ON ix.indexrelid = i.oid
    JOIN pg_class t ON ix.indrelid = t.oid
    JOIN pg_namespace AS n ON n.oid = t.relnamespace
    JOIN pg_am a ON i.relam = a.oid
    CROSS JOIN LATERAL gin_metapage_info(get_raw_page(quote_ident(i.relname), 0)) AS gm
    WHERE a.amname = 'gin'
    AND n.nspname = `;
  builder.append(sql);
  builder.param(schemaName);
  builder.append(' AND t.relname IN ');
  builder.appendParameters(tableNames, true);
  builder.append(' ORDER BY "tableName", "indexName"');

  const results = await client.query<{
    schemaName: string;
    tableName: string;
    indexName: string;
    indexOptions: string;
    fastUpdate: boolean;
    ginPendingListLimit: number;
  }>(builder.toString(), builder.getValues());

  const rows = results.rows as GinIndexInfo[];
  for (const row of rows) {
    for (const k in row) {
      if ((row as any)[k] === null) {
        (row as any)[k] = undefined;
      }
    }
    if (row.indexOptions) {
      row.indexOptions = arrayToString(row.indexOptions as unknown as string[]);
    }
  }

  return rows;
}

function arrayToString(arr: (number | string)[] | undefined): string | undefined {
  return arr && '{' + escapeUnicode(arr.join(',')) + '}';
}
