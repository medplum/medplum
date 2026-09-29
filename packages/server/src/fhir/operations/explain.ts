// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  arrayify,
  badRequest,
  forbidden,
  getSearchResourceTypes,
  isResourceType,
  OperationOutcomeError,
  parseSearchRequest,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { RepositoryMode } from '@medplum/fhir-router';
import type { Project, Reference, ResourceType } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { getAuthenticatedContext, requireSuperAdmin } from '../../context';
import { escapeUnicode } from '../../migrations/migrate-utils';
import type { Repository } from '../repo';
import { repoAccess } from '../repository/access-tracker';
import { getCount, getSelectQueryForSearch } from '../search';
import { SqlBuilder } from '../sql';
import { makeOperationDefinition } from './definitions';
import {
  buildOutputParameters,
  makeOperationDefinitionParameter as param,
  parseInputParameters,
} from './utils/parameters';

const hypotheticalIndexOutputParts = [
  param('out', 'indexrelid', 'string', 1, '1'),
  param('out', 'indexName', 'string', 1, '1'),
  param('out', 'schemaName', 'string', 0, '1'),
  param('out', 'tableName', 'string', 0, '1'),
  param('out', 'accessMethod', 'string', 0, '1'),
  param('out', 'definition', 'string', 1, '1'),
];

export type ExplainHypotheticalIndex = {
  indexrelid: string;
  indexName: string;
  schemaName?: string;
  tableName?: string;
  accessMethod?: string;
  definition: string;
};

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'db-explain',
    code: 'explain',
    parameter: [
      param('in', 'query', 'string', 0, '1'),
      param('in', 'sql', 'string', 0, '1'),
      param('in', 'analyze', 'boolean', 0, '1'),
      param('in', 'format', 'string', 0, '1'),
      param('in', 'count', 'boolean', 0, '1'),
      param('in', 'hypotheticalIndex', 'string', 0, '*'),
      param('out', 'query', 'string', 1, '1'),
      param('out', 'parameters', 'string', 1, '1'),
      param('out', 'explain', 'string', 1, '1'),
      param('out', 'countEstimate', 'integer', 0, '1'),
      param('out', 'countAccurate', 'integer', 0, '1'),
      param('out', 'hypotheticalIndex', 'Element', 0, '*', hypotheticalIndexOutputParts),
      param('out', 'warning', 'string', 0, '*'),
    ],
  }
);

const CREATE_INDEX_PATTERN = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+/i;

export async function dbExplainHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireExplainAccess();
  const params = parseInputParameters<{
    query?: string;
    sql?: string;
    project?: Reference<Project>;
    analyze?: boolean;
    format?: 'text' | 'json';
    count?: boolean;
    hypotheticalIndex?: string | string[];
  }>(operation, req);
  const fhirQuery = params.query?.trim();
  const rawSql = params.sql?.trim();
  if (Boolean(fhirQuery) === Boolean(rawSql)) {
    throw new OperationOutcomeError(badRequest('Exactly one of query or sql is required'));
  }

  const repo = ctx.repo.clone();
  repo.setMode(RepositoryMode.READER);
  const hypotheticalIndexStatements = parseHypotheticalIndexStatements(params.hypotheticalIndex);
  const warnings: string[] = [];
  const analyze = !!params.analyze;
  if (analyze && hypotheticalIndexStatements.length > 0) {
    warnings.push('EXPLAIN ANALYZE is skipped because HypoPG hypothetical indexes are only considered by EXPLAIN');
  }

  const explainOptions = ['settings'];
  if (analyze && hypotheticalIndexStatements.length === 0) {
    explainOptions.push('analyze', 'buffers');
  }
  if (params.format === 'json') {
    explainOptions.push('format json');
  }

  let query: string;
  let parameters: string;
  let searchResourceTypes: ResourceType[];
  let runExplain: (explainRepo: Repository) => Promise<{
    result: { 'QUERY PLAN': unknown }[];
    countResult?: Awaited<ReturnType<typeof getCount>>;
  }>;

  if (rawSql) {
    if (params.count) {
      warnings.push('Total count is only available for FHIR search queries');
    }
    const sql = normalizeExplainSql(rawSql);
    searchResourceTypes = inferExplainResourceTypes(sql, ...hypotheticalIndexStatements);
    query = sql;
    parameters = '';
    runExplain = async (explainRepo) => {
      const result = await explainRepo.executeRawSql<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (${explainOptions.join(', ')}) ${sql}`,
        undefined,
        repoAccess.sqlRead(searchResourceTypes, { source: 'dbExplainHandler' })
      );
      return { result };
    };
  } else {
    const searchReq = parseSearchRequest(fhirQuery as string);
    const selectQuery = getSelectQueryForSearch(repo, searchReq);
    const sqlBuilder = new SqlBuilder();
    selectQuery.buildSql(sqlBuilder);
    query = sqlBuilder.toString();
    parameters = sqlBuilder
      .getValues()
      .map((v, i) => `$${i + 1} = ${formatQueryParam(v)}`)
      .join(', ');

    selectQuery.explain = explainOptions;
    searchResourceTypes = getSearchResourceTypes(searchReq);
    runExplain = async (explainRepo) => {
      const result = await explainRepo.executeSql<{ 'QUERY PLAN': unknown }>(
        selectQuery,
        repoAccess.sqlRead(searchResourceTypes, { source: 'dbExplainHandler' })
      );
      const countResult = params.count ? await getCount(explainRepo, searchReq, { forceAccurate: true }) : undefined;
      return { result, countResult };
    };
  }

  const { result, countResult, hypotheticalIndexes } = await repo.withStatementTimeout(
    { timeoutMs: 0, resourceTypes: searchResourceTypes },
    async () => {
      return withHypotheticalIndexes(repo, searchResourceTypes, hypotheticalIndexStatements, runExplain);
    }
  );

  const explain = formatExplainOutput(result, params.format);

  const output = buildOutputParameters(operation, {
    query,
    parameters,
    explain: escapeUnicode(explain),
    countEstimate: countResult?.estimate,
    countAccurate: countResult?.accurate,
    hypotheticalIndex: hypotheticalIndexes,
    warning: warnings,
  });
  return [allOk, output];
}

function formatExplainOutput(result: { 'QUERY PLAN': unknown }[], format?: string): string {
  if (format === 'json') {
    const plan = result[0]['QUERY PLAN'];
    const root = Array.isArray(plan) ? plan[0] : plan;
    return JSON.stringify(root, (key, value) => (key.endsWith('Blocks') && value === 0 ? undefined : value), 0);
  }
  return result.map((r) => String(r['QUERY PLAN'])).join('\n');
}

export function normalizeExplainSql(input: string): string {
  const sql = input.trim().replace(/;+\s*$/, '');
  if (!sql) {
    throw new OperationOutcomeError(badRequest('sql is required'));
  }
  if (/;\s*\S/.test(sql)) {
    throw new OperationOutcomeError(badRequest('sql must be a single statement'));
  }
  if (!/^(WITH|SELECT)\b/i.test(sql)) {
    throw new OperationOutcomeError(badRequest('sql must be a SELECT or WITH query'));
  }
  return sql;
}

export function inferExplainResourceTypes(...texts: string[]): ResourceType[] {
  const types = new Set<ResourceType>();
  for (const text of texts) {
    for (const match of text.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"/g)) {
      const resourceType = resourceTypeFromIdentifier(match[1]);
      if (resourceType) {
        types.add(resourceType);
      }
    }
  }
  if (types.size === 0) {
    return ['Project'];
  }
  return Array.from(types);
}

function resourceTypeFromIdentifier(identifier: string): ResourceType | undefined {
  if (isResourceType(identifier)) {
    return identifier;
  }
  const idx = identifier.indexOf('_');
  if (idx > 0) {
    const base = identifier.slice(0, idx);
    if (isResourceType(base)) {
      return base;
    }
  }
  return undefined;
}

export function parseHypotheticalIndexStatements(input: string | string[] | undefined): string[] {
  const statements: string[] = [];
  for (const chunk of arrayify(input) ?? []) {
    for (const part of chunk.split(';')) {
      const stmt = part.trim();
      if (!stmt) {
        continue;
      }
      if (!CREATE_INDEX_PATTERN.test(stmt)) {
        throw new OperationOutcomeError(badRequest('hypotheticalIndex must be a CREATE INDEX statement'));
      }
      if (/\bCONCURRENTLY\b/i.test(stmt)) {
        throw new OperationOutcomeError(badRequest('hypotheticalIndex cannot use CONCURRENTLY'));
      }
      statements.push(stmt);
    }
  }
  return statements;
}

export async function withHypotheticalIndexes<T extends object>(
  repo: Repository,
  searchResourceTypes: ReturnType<typeof getSearchResourceTypes>,
  statements: string[],
  callback: (explainRepo: Repository) => Promise<T>
): Promise<T & { hypotheticalIndexes?: ExplainHypotheticalIndex[] }> {
  const access = repoAccess.sqlRead(searchResourceTypes, { source: 'dbExplainHandler' });
  const transactionOptions = {
    resourceTypes: searchResourceTypes,
    source: 'dbExplainHandler',
  };

  try {
    return await repo.withTransaction(async (txRepo) => {
      // Reject writes (including data-modifying CTEs) if EXPLAIN ANALYZE actually runs the query.
      await txRepo.executeRawSql(
        'SET TRANSACTION READ ONLY',
        undefined,
        repoAccess.sqlReadConfig(searchResourceTypes, { source: 'dbExplainHandler' })
      );
      if (statements.length === 0) {
        return { ...(await callback(txRepo)) };
      }

      // HypoPG indexes live in connection memory (not rolled back); create+EXPLAIN share one connection and reset in finally.
      try {
        await txRepo.executeRawSql('SELECT hypopg_reset()', undefined, access);

        for (const stmt of statements) {
          await txRepo.executeRawSql('SELECT hypopg_create_index($1)', [stmt], access);
        }
        const result = await callback(txRepo);
        const listed = await txRepo.executeRawSql<{
          indexrelid: string;
          index_name: string;
          schema_name: string;
          table_name: string;
          am_name: string;
          definition: string;
        }>(
          `SELECT indexrelid::text AS indexrelid,
                  index_name,
                  schema_name,
                  table_name,
                  am_name,
                  hypopg_get_indexdef(indexrelid) AS definition
           FROM hypopg_list_indexes`,
          undefined,
          access
        );
        const hypotheticalIndexes = listed.map((row) => ({
          indexrelid: row.indexrelid,
          indexName: row.index_name,
          schemaName: row.schema_name,
          tableName: row.table_name,
          accessMethod: row.am_name,
          definition: row.definition,
        }));
        return { ...result, hypotheticalIndexes };
      } finally {
        await txRepo.executeRawSql('SELECT hypopg_reset()', undefined, access);
      }
    }, transactionOptions);
  } catch (err) {
    if (isUndefinedFunctionError(err)) {
      throw new OperationOutcomeError(badRequest('hypopg extension is not available on this database'));
    }
    throw err;
  }
}

export function isUndefinedFunctionError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '42883';
}

/**
 * This is probably an incomplete implementation, but is meant to approximate the output
 * in auto_explain slow query entries
 * @param param - The parameter value to format
 * @returns The formatted parameter value
 */
function formatQueryParam(param: any): string {
  if (typeof param === 'number') {
    return param.toString();
  }
  return `'${typeof param === 'string' ? escapeUnicode(param) : param}'`;
}

/**
 * Requires a super-admin caller while preserving the effective repository for delegated requests.
 * Unlike other privileged operations, $explain intentionally uses On-Behalf-Of to show the query
 * plan produced by the delegated user's access policy.
 * @returns The authenticated request context.
 */
function requireExplainAccess(): AuthenticatedRequestContext {
  const ctx = getAuthenticatedContext();

  if (ctx.authState.onBehalfOfMembership) {
    // if onBehalfOf, must check if the actor's project is a super admin
    if (!ctx.authState.project.superAdmin) {
      throw new OperationOutcomeError(forbidden);
    }
  } else {
    // if no onBehalfOfMembership, just check for super admin
    return requireSuperAdmin();
  }

  return ctx;
}
