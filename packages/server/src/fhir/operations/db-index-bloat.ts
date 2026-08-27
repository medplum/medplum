// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Pool } from 'pg';
import { requireSuperAdmin } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { makeOperationDefinition } from './definitions';
import {
  buildOutputParameters,
  makeOperationDefinitionParameter as param,
  parseInputParameters,
} from './utils/parameters';

const DEFAULT_MIN_BLOAT_PERCENT = 30;
const DEFAULT_MIN_BLOAT_BYTES = 100 * 1024 * 1024;

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'db-index-bloat',
    code: 'db-index-bloat',
    parameter: [
      param('in', 'minBloatPercent', 'decimal', 0, '1'),
      param('in', 'minBloatBytes', 'decimal', 0, '1'),
      param('out', 'index', undefined, 0, '*', [
        param('out', 'schemaName', 'string', 1, '1'),
        param('out', 'tableName', 'string', 1, '1'),
        param('out', 'indexName', 'string', 1, '1'),
        param('out', 'indexType', 'code', 1, '1'),
        param('out', 'analysisMethod', 'code', 1, '1'),
        param('out', 'indexSize', 'decimal', 1, '1'),
        param('out', 'estimatedBloatSize', 'decimal', 1, '1'),
        param('out', 'bloatPercent', 'decimal', 1, '1'),
        param('out', 'fillFactor', 'integer', 0, '1'),
        param('out', 'avgLeafDensity', 'decimal', 0, '1'),
        param('out', 'leafFragmentation', 'decimal', 0, '1'),
        param('out', 'emptyPages', 'decimal', 0, '1'),
        param('out', 'deletedPages', 'decimal', 0, '1'),
        param('out', 'totalPages', 'decimal', 0, '1'),
        param('out', 'entryPages', 'decimal', 0, '1'),
        param('out', 'dataPages', 'decimal', 0, '1'),
        param('out', 'pendingPages', 'decimal', 0, '1'),
      ]),
    ],
  }
);

export interface BtreeIndexStatsRow {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexSize: string;
  blockSize: string;
  fillFactor: number;
  leafPages: string;
  emptyPages: string;
  deletedPages: string;
  avgLeafDensity: number;
  leafFragmentation: number;
}

export interface GinIndexStatsRow {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexSize: string;
  blockSize: string;
  totalPages: string;
  entryPages: string;
  dataPages: string;
  pendingPages: string;
}

export interface IndexBloatInfo {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: 'btree' | 'gin';
  analysisMethod: 'pgstatindex' | 'gin-metapage';
  indexSize: number;
  estimatedBloatSize: number;
  bloatPercent: number;
  fillFactor?: number;
  avgLeafDensity?: number;
  leafFragmentation?: number;
  emptyPages?: number;
  deletedPages?: number;
  totalPages?: number;
  entryPages?: number;
  dataPages?: number;
  pendingPages?: number;
}

export async function dbIndexBloatHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ minBloatPercent?: number; minBloatBytes?: number }>(operation, req);
  const minBloatPercent = params.minBloatPercent ?? DEFAULT_MIN_BLOAT_PERCENT;
  const minBloatBytes = params.minBloatBytes ?? DEFAULT_MIN_BLOAT_BYTES;
  validateThresholds(minBloatPercent, minBloatBytes);

  const client = getDatabasePool(DatabaseMode.WRITER);
  const indexes = [
    ...(await getBtreeIndexBloat(client, minBloatBytes)),
    ...(await getGinIndexBloat(client, minBloatBytes)),
  ]
    .filter((index) => index.bloatPercent >= minBloatPercent && index.estimatedBloatSize >= minBloatBytes)
    .sort((a, b) => b.estimatedBloatSize - a.estimatedBloatSize);

  return [allOk, buildOutputParameters(operation, { index: indexes })];
}

function validateThresholds(minBloatPercent: number, minBloatBytes: number): void {
  if (!Number.isFinite(minBloatPercent) || minBloatPercent < 0 || minBloatPercent > 100) {
    throw new OperationOutcomeError(badRequest('minBloatPercent must be between 0 and 100'));
  }
  if (!Number.isFinite(minBloatBytes) || minBloatBytes < 0 || !Number.isSafeInteger(minBloatBytes)) {
    throw new OperationOutcomeError(badRequest('minBloatBytes must be a non-negative safe integer'));
  }
}

async function getBtreeIndexBloat(client: Pool, minIndexSize: number): Promise<IndexBloatInfo[]> {
  const result = await client.query<BtreeIndexStatsRow>(
    `SELECT
      n.nspname AS "schemaName",
      t.relname AS "tableName",
      i.relname AS "indexName",
      pg_relation_size(i.oid)::text AS "indexSize",
      current_setting('block_size')::text AS "blockSize",
      COALESCE(
        (SELECT option_value::integer FROM pg_options_to_table(i.reloptions) WHERE option_name = 'fillfactor'),
        90
      ) AS "fillFactor",
      stats.leaf_pages::text AS "leafPages",
      stats.empty_pages::text AS "emptyPages",
      stats.deleted_pages::text AS "deletedPages",
      stats.avg_leaf_density AS "avgLeafDensity",
      stats.leaf_fragmentation AS "leafFragmentation"
    FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      CROSS JOIN LATERAL pgstatindex(i.oid::regclass) stats
    WHERE n.nspname = 'public'
      AND am.amname = 'btree'
      AND ix.indisvalid
      AND ix.indisready
      AND ix.indislive
      AND pg_relation_size(i.oid) >= $1::bigint`,
    [minIndexSize]
  );
  return result.rows.map(calculateBtreeBloat);
}

async function getGinIndexBloat(client: Pool, minIndexSize: number): Promise<IndexBloatInfo[]> {
  const result = await client.query<GinIndexStatsRow>(
    `SELECT
      n.nspname AS "schemaName",
      t.relname AS "tableName",
      i.relname AS "indexName",
      pg_relation_size(i.oid)::text AS "indexSize",
      current_setting('block_size')::text AS "blockSize",
      stats.n_total_pages::text AS "totalPages",
      stats.n_entry_pages::text AS "entryPages",
      stats.n_data_pages::text AS "dataPages",
      stats.n_pending_pages::text AS "pendingPages"
    FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      CROSS JOIN LATERAL gin_metapage_info(get_raw_page(i.oid::regclass::text, 0)) stats
    WHERE n.nspname = 'public'
      AND am.amname = 'gin'
      AND ix.indisvalid
      AND ix.indisready
      AND ix.indislive
      AND pg_relation_size(i.oid) >= $1::bigint`,
    [minIndexSize]
  );
  return result.rows.map(calculateGinBloat);
}

export function calculateBtreeBloat(row: BtreeIndexStatsRow): IndexBloatInfo {
  const indexSize = Number(row.indexSize);
  const blockSize = Number(row.blockSize);
  const leafPages = Number(row.leafPages);
  const emptyPages = Number(row.emptyPages);
  const deletedPages = Number(row.deletedPages);
  const avgLeafDensity = Number.isFinite(row.avgLeafDensity) ? row.avgLeafDensity : row.fillFactor;
  const leafFragmentation = Number.isFinite(row.leafFragmentation) ? row.leafFragmentation : 0;
  const leafBloatFraction = Math.max(0, 1 - avgLeafDensity / row.fillFactor);
  const estimatedBloatSize = Math.min(
    indexSize,
    Math.max(0, Math.round((leafPages * leafBloatFraction + emptyPages + deletedPages) * blockSize))
  );

  return {
    schemaName: row.schemaName,
    tableName: row.tableName,
    indexName: row.indexName,
    indexType: 'btree',
    analysisMethod: 'pgstatindex',
    indexSize,
    estimatedBloatSize,
    bloatPercent: calculatePercent(estimatedBloatSize, indexSize),
    fillFactor: row.fillFactor,
    avgLeafDensity,
    leafFragmentation,
    emptyPages,
    deletedPages,
  };
}

export function calculateGinBloat(row: GinIndexStatsRow): IndexBloatInfo {
  const indexSize = Number(row.indexSize);
  const blockSize = Number(row.blockSize);
  const totalPages = Number(row.totalPages);
  const entryPages = Number(row.entryPages);
  const dataPages = Number(row.dataPages);
  const pendingPages = Number(row.pendingPages);
  const unusedPages = Math.max(0, totalPages - entryPages - dataPages - pendingPages - 1);
  const estimatedBloatSize = Math.min(indexSize, unusedPages * blockSize);

  return {
    schemaName: row.schemaName,
    tableName: row.tableName,
    indexName: row.indexName,
    indexType: 'gin',
    analysisMethod: 'gin-metapage',
    indexSize,
    estimatedBloatSize,
    bloatPercent: calculatePercent(estimatedBloatSize, indexSize),
    totalPages,
    entryPages,
    dataPages,
    pendingPages,
  };
}

function calculatePercent(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}
