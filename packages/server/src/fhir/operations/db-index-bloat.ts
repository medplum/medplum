// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, EMPTY, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { requireSuperAdmin } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import type { PgQueryable } from '../sql';
import { isValidPostgresIdentifier } from '../sql';
import { makeOperationDefinition } from './definitions';
import {
  buildOutputParameters,
  makeOperationDefinitionParameter as param,
  parseInputParameters,
} from './utils/parameters';

const DEFAULT_MIN_BLOAT_PERCENT = 30;
const DEFAULT_MIN_INDEX_SIZE = 100 * 1024 * 1024;

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'db-index-bloat',
    code: 'db-index-bloat',
    parameter: [
      param('in', 'tableName', 'string', 0, '*'),
      param('in', 'minBloatPercent', 'decimal', 0, '1'),
      param('in', 'minIndexSize', 'decimal', 0, '1'),
      param('out', 'index', undefined, 0, '*', [
        param('out', 'schemaName', 'string', 1, '1'),
        param('out', 'tableName', 'string', 1, '1'),
        param('out', 'indexName', 'string', 1, '1'),
        param('out', 'indexType', 'code', 1, '1'),
        param('out', 'analysisMethod', 'code', 1, '1'),
        param('out', 'indexSize', 'decimal', 1, '1'),
        param('out', 'estimatedBloatSize', 'decimal', 0, '1'),
        param('out', 'bloatPercent', 'decimal', 0, '1'),
        param('out', 'fillFactor', 'integer', 0, '1'),
        param('out', 'liveTuples', 'decimal', 0, '1'),
        param('out', 'allocatedPages', 'decimal', 0, '1'),
        param('out', 'liveTuplesPerPage', 'decimal', 0, '1'),
      ]),
    ],
  }
);

export interface BtreeIndexStatsRow {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexSize: string;
  fillFactor: number;
  estimatedBloatSize: string;
}

export interface GinIndexStatsRow {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexSize: string;
  liveTuples: string;
  allocatedPages: string;
}

export interface IndexBloatInfo {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: 'btree' | 'gin';
  analysisMethod: 'catalog-estimate' | 'catalog-density';
  indexSize: number;
  estimatedBloatSize?: number;
  bloatPercent?: number;
  fillFactor?: number;
  liveTuples?: number;
  allocatedPages?: number;
  liveTuplesPerPage?: number;
}

export async function dbIndexBloatHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const params = parseInputParameters<{ tableName?: string; minBloatPercent?: number; minIndexSize?: number }>(
    operation,
    req
  );
  const tableNames: string[] = [];
  for (const tableName of params.tableName?.split(',').map((name) => name.trim()) ?? EMPTY) {
    if (!isValidPostgresIdentifier(tableName)) {
      throw new OperationOutcomeError(badRequest('Invalid tableName'));
    }
    tableNames.push(tableName);
  }
  const minBloatPercent = params.minBloatPercent ?? DEFAULT_MIN_BLOAT_PERCENT;
  const minIndexSize = params.minIndexSize ?? DEFAULT_MIN_INDEX_SIZE;
  validateThresholds(minBloatPercent, minIndexSize);

  const client = getDatabasePool(DatabaseMode.WRITER);
  const [btreeIndexes, ginIndexes] = await Promise.all([
    getBtreeIndexBloat(client, minIndexSize, tableNames),
    getGinIndexDensity(client, minIndexSize, tableNames),
  ]);
  const filteredBtreeIndexes = btreeIndexes.filter((index) => (index.bloatPercent ?? 0) >= minBloatPercent);
  const indexes = [...filteredBtreeIndexes, ...ginIndexes].sort((a, b) => b.indexSize - a.indexSize);

  return [allOk, buildOutputParameters(operation, { index: indexes })];
}

function validateThresholds(minBloatPercent: number, minIndexSize: number): void {
  if (!Number.isFinite(minBloatPercent) || minBloatPercent < 0 || minBloatPercent > 100) {
    throw new OperationOutcomeError(badRequest('minBloatPercent must be between 0 and 100'));
  }
  if (!Number.isFinite(minIndexSize) || minIndexSize < 0 || !Number.isSafeInteger(minIndexSize)) {
    throw new OperationOutcomeError(badRequest('minIndexSize must be a non-negative safe integer'));
  }
}

async function getBtreeIndexBloat(
  client: PgQueryable,
  minIndexSize: number,
  tableNames: string[]
): Promise<IndexBloatInfo[]> {
  // Adapts the B-tree tuple-width and expected-page formula from
  // https://github.com/ioguix/pgsql-bloat-estimation/blob/master/btree/btree_bloat.sql
  // A bounded pageinspect.bt_page_stats sample could refine this estimate without a full scan, but would need
  // validation against localized bloat before being used here.
  const result = await client.query<BtreeIndexStatsRow>(
    `WITH btree_indexes AS (
      SELECT
        n.nspname AS "schemaName", t.relname AS "tableName", i.relname AS "indexName",
        i.oid AS "indexOid", t.oid AS "tableOid", GREATEST(i.reltuples, 0) AS "indexTuples",
        pg_relation_size(i.oid) AS "indexSize",
        COALESCE(
          (SELECT option_value::integer FROM pg_options_to_table(i.reloptions) WHERE option_name = 'fillfactor'),
          90
        ) AS "fillFactor",
        string_to_array(ix.indkey::text, ' ')::integer[] AS "attributeNumbers", ix.indnatts AS "attributeCount"
      FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname = 'public'
        AND am.amname = 'btree'
        AND ix.indisvalid
        AND ix.indisready
        AND ix.indislive
        AND pg_relation_size(i.oid) >= $1::bigint
        AND ($2::text[] IS NULL OR t.relname = ANY($2::text[]))
    ), index_columns AS (
      SELECT
        idx.*,
        CASE
          WHEN idx."attributeNumbers"[position] = 0 THEN idx."indexOid"
          ELSE idx."tableOid"
        END AS "statsRelationOid",
        CASE
          WHEN idx."attributeNumbers"[position] = 0 THEN position
          ELSE idx."attributeNumbers"[position]
        END AS "statsAttributeNumber"
      FROM btree_indexes idx
        CROSS JOIN LATERAL generate_series(1, idx."attributeCount") position
    ), index_widths AS (
      SELECT
        columns."schemaName", columns."tableName", columns."indexName",
        columns."indexTuples", columns."indexSize", columns."fillFactor",
        current_setting('block_size')::numeric AS "blockSize",
        CASE
          WHEN version() ~ 'mingw32|64-bit|x86_64|ppc64|ia64|amd64' THEN 8
          ELSE 4
        END AS "maxAlign",
        CASE
          WHEN MAX(COALESCE(stats.null_frac, 0)) = 0 THEN 8
          ELSE 8 + ((32 + 8 - 1) / 8)
        END AS "indexTupleHeader",
        SUM((1 - COALESCE(stats.null_frac, 0)) * COALESCE(stats.avg_width, 1024)) AS "dataWidth"
      FROM index_columns columns
        JOIN pg_attribute attribute
          ON attribute.attrelid = columns."statsRelationOid"
          AND attribute.attnum = columns."statsAttributeNumber"
        JOIN pg_class stats_relation ON stats_relation.oid = columns."statsRelationOid"
        JOIN pg_namespace stats_namespace ON stats_namespace.oid = stats_relation.relnamespace
        JOIN pg_stats stats
          ON stats.schemaname = stats_namespace.nspname
          AND stats.tablename = stats_relation.relname
          AND stats.attname = attribute.attname
      GROUP BY
        columns."schemaName", columns."tableName", columns."indexName",
        columns."indexTuples", columns."indexSize", columns."fillFactor"
      HAVING NOT BOOL_OR(attribute.atttypid = 'pg_catalog.name'::regtype)
    ), aligned_widths AS (
      SELECT
        widths.*,
        widths."indexTupleHeader" + widths."maxAlign" -
          CASE
            WHEN widths."indexTupleHeader" % widths."maxAlign" = 0 THEN widths."maxAlign"
            ELSE widths."indexTupleHeader" % widths."maxAlign"
          END +
        widths."dataWidth" + widths."maxAlign" -
          CASE
            WHEN widths."dataWidth" = 0 THEN 0
            WHEN widths."dataWidth"::integer % widths."maxAlign" = 0 THEN widths."maxAlign"
            ELSE widths."dataWidth"::integer % widths."maxAlign"
          END AS "indexTupleWidth"
      FROM index_widths widths
    ), estimates AS (
      SELECT
        aligned.*,
        COALESCE(
          1 + CEIL(
            aligned."indexTuples" /
            NULLIF(FLOOR(
              (aligned."blockSize" - 16 - 24) * aligned."fillFactor" /
              (100 * (4 + aligned."indexTupleWidth"))
            ), 0)
          ),
          0
        ) AS "estimatedPages"
      FROM aligned_widths aligned
    )
    SELECT
      estimates."schemaName", estimates."tableName", estimates."indexName",
      estimates."indexSize"::text AS "indexSize", estimates."fillFactor",
      GREATEST(
        estimates."indexSize"::numeric - estimates."estimatedPages" * estimates."blockSize",
        0
      )::bigint::text AS "estimatedBloatSize"
    FROM estimates`,
    [minIndexSize, tableNames.length > 0 ? tableNames : null]
  );
  return result.rows.map(calculateBtreeBloat);
}

async function getGinIndexDensity(
  client: PgQueryable,
  minIndexSize: number,
  tableNames: string[]
): Promise<IndexBloatInfo[]> {
  const result = await client.query<GinIndexStatsRow>(
    `SELECT
      n.nspname AS "schemaName", t.relname AS "tableName", i.relname AS "indexName",
      pg_relation_size(i.oid)::text AS "indexSize", GREATEST(t.reltuples, 0)::bigint::text AS "liveTuples",
      CEIL(
        pg_relation_size(i.oid)::numeric / current_setting('block_size')::numeric
      )::bigint::text AS "allocatedPages"
    FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
    WHERE n.nspname = 'public'
      AND am.amname = 'gin'
      AND ix.indisvalid
      AND ix.indisready
      AND ix.indislive
      AND pg_relation_size(i.oid) >= $1::bigint
      AND ($2::text[] IS NULL OR t.relname = ANY($2::text[]))`,
    [minIndexSize, tableNames.length > 0 ? tableNames : null]
  );
  return result.rows.map(calculateGinDensity);
}

export function calculateBtreeBloat(row: BtreeIndexStatsRow): IndexBloatInfo {
  const indexSize = Number(row.indexSize);
  const estimatedBloatSize = Math.min(indexSize, Math.max(0, Number(row.estimatedBloatSize)));

  return {
    schemaName: row.schemaName,
    tableName: row.tableName,
    indexName: row.indexName,
    indexType: 'btree',
    analysisMethod: 'catalog-estimate',
    indexSize,
    estimatedBloatSize,
    bloatPercent: calculatePercent(estimatedBloatSize, indexSize),
    fillFactor: row.fillFactor,
  };
}

export function calculateGinDensity(row: GinIndexStatsRow): IndexBloatInfo {
  const indexSize = Number(row.indexSize);
  const liveTuples = Number(row.liveTuples);
  const allocatedPages = Number(row.allocatedPages);

  return {
    schemaName: row.schemaName,
    tableName: row.tableName,
    indexName: row.indexName,
    indexType: 'gin',
    analysisMethod: 'catalog-density',
    indexSize,
    liveTuples,
    allocatedPages,
    liveTuplesPerPage: allocatedPages > 0 ? liveTuples / allocatedPages : 0,
  };
}

function calculatePercent(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}
