// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import type { Client, Pool } from 'pg';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { escapeUnicode } from '../../migrations/migrate-utils';
import { isValidTableName } from '../sql';
import {
  buildOutputParameters,
  makeOperationDefinitionParameter as param,
  parseInputParameters,
} from './utils/parameters';

const LookupOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-column-statistics',
  status: 'active',
  kind: 'operation',
  code: 'db-column-statistics',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    param('in', 'shardId', 'string', 1, '1'),
    param('in', 'tableName', 'string', 0, '1'),
    param('out', 'defaultStatisticsTarget', 'integer', 1, '1'),
    param('out', 'table', undefined, 0, '1', [
      param('out', 'tableName', 'string', 1, '1'),
      param('out', 'column', undefined, 1, '*', [
        param('out', 'name', 'string', 1, '1'),
        param('out', 'statisticsTarget', 'integer', 1, '1'),
        param('out', 'schemaName', 'string', 1, '1'),
        param('out', 'tableName', 'string', 1, '1'),
        param('out', 'type', 'string', 1, '1'),
        param('out', 'notNull', 'boolean', 1, '1'),
        param('out', 'defaultValue', 'string', 0, '1'),
        param('out', 'nullFraction', 'decimal', 0, '1'),
        param('out', 'avgWidth', 'integer', 0, '1'),
        param('out', 'nDistinct', 'decimal', 0, '1'),
        param('out', 'mostCommonValues', 'string', 0, '1'),
        param('out', 'mostCommonFreqs', 'string', 0, '1'),
        param('out', 'histogramBounds', 'string', 0, '1'),
        param('out', 'correlation', 'decimal', 0, '1'),
        param('out', 'mostCommonElems', 'string', 0, '1'),
        param('out', 'mostCommonElemFreqs', 'string', 0, '1'),
        param('out', 'elemCountHistogram', 'string', 0, '1'),
      ]),
    ]),
  ],
};

export async function getColumnStatisticsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ shardId: string; tableName?: string }>(LookupOperation, req);

  if (params.tableName && !isValidTableName(params.tableName)) {
    throw new OperationOutcomeError(badRequest('Invalid tableName'));
  }

  const defaultStatisticsTarget = await getDefaultStatisticsTarget(params.shardId);
  const client = getDatabasePool(DatabaseMode.WRITER, params.shardId);
  let columns: ColumnInfo[] | undefined;
  const output: { defaultStatisticsTarget: number; table?: { tableName: string; column: ColumnInfo[] } } = {
    defaultStatisticsTarget,
  };

  if (params.tableName) {
    columns = await getTableColumns(client, params.tableName);
    output.table = {
      tableName: params.tableName,
      column: columns,
    };
  }

  return [allOk, buildOutputParameters(LookupOperation, output)];
}

async function getDefaultStatisticsTarget(shardId: string): Promise<number> {
  const client = getDatabasePool(DatabaseMode.WRITER, shardId);
  const defaultStatisticsTarget = await client.query('SELECT setting FROM pg_settings WHERE name = $1', [
    'default_statistics_target',
  ]);
  return Number(defaultStatisticsTarget.rows[0].setting);
}

// mostCommonFreqs, mostCommonElemFreqs, elemCountHistogram are returned as number[] from pg_stats
// since number[] is an unwieldy type to work with upstream, we convert them to strings
interface RawColumnInfo {
  schemaName: string;
  tableName: string;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | undefined;
  primaryKey: boolean;
  statisticsTarget: number;
  nullFraction: number | undefined;
  avgWidth: number | undefined;
  nDistinct: number | undefined;
  mostCommonValues: string | undefined;
  mostCommonFreqs: number[] | undefined;
  histogramBounds: string | undefined;
  correlation: number | undefined;
  mostCommonElems: string | undefined;
  mostCommonElemFreqs: number[] | undefined;
  elemCountHistogram: number[] | undefined;
}

interface ColumnInfo {
  schemaName: string;
  tableName: string;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | undefined;
  primaryKey: boolean;
  statisticsTarget: number;
  nullFraction: number | undefined;
  avgWidth: number | undefined;
  nDistinct: number | undefined;
  mostCommonValues: string | undefined;
  mostCommonFreqs: string | undefined;
  histogramBounds: string | undefined;
  correlation: number | undefined;
  mostCommonElems: string | undefined;
  mostCommonElemFreqs: string | undefined;
  elemCountHistogram: string | undefined;
}

async function getTableColumns(db: Client | Pool, tableName: string): Promise<ColumnInfo[]> {
  const rs = await db.query<RawColumnInfo>(
    `SELECT
      n.nspname as "schemaName",
      c.relname as "tableName",
      a.attname as "name",
      a.attnotnull as "notNull",
      format_type(a.atttypid, a.atttypmod) as "type",
      COALESCE((SELECT indisprimary from pg_index where indrelid = a.attrelid AND attnum = any(indkey) and indisprimary = true), FALSE) as "primaryKey",
      pg_get_expr(d.adbin, d.adrelid) AS "defaultValue",
      COALESCE(a.attstattarget, -1) AS "statisticsTarget",
      s.null_frac AS "nullFraction",
      s.avg_width AS "avgWidth",
      s.n_distinct AS "nDistinct",
      s.most_common_vals AS "mostCommonValues",
      s.most_common_freqs AS "mostCommonFreqs",
      s.histogram_bounds AS "histogramBounds",
      s.correlation AS "correlation",
      s.most_common_elems AS "mostCommonElems",
      s.most_common_elem_freqs AS "mostCommonElemFreqs",
      s.elem_count_histogram AS "elemCountHistogram"
    FROM
      pg_attribute AS a
      JOIN pg_class AS c ON c.oid = a.attrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
      LEFT JOIN pg_stats AS s ON s.attname = a.attname AND s.tablename = c.relname
    WHERE
      n.nspname = 'public'
      AND c.relname = $1
      AND attnum > 0
      AND NOT attisdropped
    ORDER BY attnum;
  `,
    [tableName]
  );

  const rows = rs.rows;
  for (const row of rows) {
    // For consistency, convert any nulls to undefined
    for (const k in row) {
      if ((row as any)[k] === null) {
        (row as any)[k] = undefined;
      }
    }

    // If column values contains characters not permitted by the FHIR string type regex, escape them for human consumption
    row.mostCommonElems = row.mostCommonElems && escapeUnicode(row.mostCommonElems);
    row.mostCommonValues = row.mostCommonValues && escapeUnicode(row.mostCommonValues);
    row.histogramBounds = row.histogramBounds && escapeUnicode(row.histogramBounds);

    // convert number[] to comma separated string
    (row as unknown as ColumnInfo).mostCommonFreqs = arrayToString(row.mostCommonFreqs);
    (row as unknown as ColumnInfo).mostCommonElemFreqs = arrayToString(row.mostCommonElemFreqs);
    (row as unknown as ColumnInfo).elemCountHistogram = arrayToString(row.elemCountHistogram);
  }

  return rows as ColumnInfo[];
}

function arrayToString(arr: (number | string)[] | undefined): string | undefined {
  return arr && '{' + escapeUnicode(arr.join(',')) + '}';
}
