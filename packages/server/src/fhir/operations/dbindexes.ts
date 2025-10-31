// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, EMPTY, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import type { Pool, PoolClient } from 'pg';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { escapeUnicode } from '../../migrations/migrate-utils';
import { isValidTableName, replaceNullWithUndefinedInRows, SqlBuilder } from '../sql';
import {
  buildOutputParameters,
  makeOperationDefinitionParameter as param,
  parseInputParameters,
} from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-indexes',
  status: 'active',
  kind: 'operation',
  code: 'db-indexes',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    param('in', 'shardId', 'string', 1, '1'),
    param('in', 'tableName', 'string', 0, '*'),
    param('out', 'defaultGinPendingListLimit', 'integer', 1, '1'),
    param('out', 'index', undefined, 0, '*', [
      param('out', 'schemaName', 'string', 1, '1'),
      param('out', 'tableName', 'string', 1, '1'),
      param('out', 'indexName', 'string', 1, '1'),
      param('out', 'indexOptions', 'string', 0, '1'),
      param('out', 'fastUpdate', 'boolean', 0, '1'),
      param('out', 'ginPendingListLimit', 'integer', 0, '1'),
    ]),
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

export async function dbIndexesHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ shardId: string; tableName?: string }>(operation, req);

  const tableNames = [];
  for (const tableName of params.tableName?.split(',').map((name) => name.trim()) ?? EMPTY) {
    if (!isValidTableName(tableName)) {
      throw new OperationOutcomeError(badRequest('Invalid tableName'));
    }
    tableNames.push(tableName);
  }

  const pool = getDatabasePool(DatabaseMode.WRITER, params.shardId);
  const defaultGinPendingListLimit = await getDefaultGinPendingListLimit(pool);

  let index: GinIndexInfo[] | undefined;
  if (tableNames.length > 0) {
    index = await getGinIndexInfo(pool, tableNames);
  }
  const output: { defaultGinPendingListLimit: number; index?: GinIndexInfo[] } = {
    defaultGinPendingListLimit,
    index,
  };

  return [allOk, buildOutputParameters(operation, output)];
}

async function getDefaultGinPendingListLimit(pool: PoolClient | Pool): Promise<number> {
  const defaultStatisticsTarget = await pool.query('SELECT setting FROM pg_settings WHERE name = $1', [
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
    (SELECT (regexp_matches(coalesce(quote_ident(opt), ''), 'fastupdate=(\\w+)'))[1]::boolean FROM unnest(coalesce(i.reloptions, '{}')) AS opt
      WHERE opt ~ '^fastupdate=') AS "fastUpdate",
		(SELECT (regexp_matches(coalesce(quote_ident(opt), ''), 'gin_pending_list_limit=(\\d+)'))[1]::INT FROM unnest(coalesce(i.reloptions, '{}')) AS opt
      WHERE opt ~ '^gin_pending_list_limit=') AS "ginPendingListLimit"
    FROM pg_index ix
    JOIN pg_class i ON ix.indexrelid = i.oid
    JOIN pg_class t ON ix.indrelid = t.oid
    JOIN pg_namespace AS n ON n.oid = t.relnamespace
    JOIN pg_am a ON i.relam = a.oid
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
  replaceNullWithUndefinedInRows(results.rows);
  for (const row of rows) {
    if (row.indexOptions) {
      row.indexOptions = arrayToString(row.indexOptions as unknown as string[]);
    }
  }

  return rows;
}

function arrayToString(arr: (number | string)[] | undefined): string | undefined {
  return arr && '{' + escapeUnicode(arr.join(',')) + '}';
}
