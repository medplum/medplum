// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  arrayify,
  badRequest,
  forbidden,
  getSearchResourceTypes,
  OperationOutcomeError,
  parseSearchRequest,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { RepositoryMode } from '@medplum/fhir-router';
import type { Project, Reference } from '@medplum/fhirtypes';
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

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'db-explain',
    code: 'explain',
    parameter: [
      param('in', 'query', 'string', 1, '1'),
      param('in', 'analyze', 'boolean', 0, '1'),
      param('in', 'format', 'string', 0, '1'),
      param('in', 'count', 'boolean', 0, '1'),
      param('in', 'hypotheticalIndex', 'string', 0, '*'),
      param('out', 'query', 'string', 1, '1'),
      param('out', 'parameters', 'string', 1, '1'),
      param('out', 'explain', 'string', 1, '1'),
      param('out', 'countEstimate', 'integer', 0, '1'),
      param('out', 'countAccurate', 'integer', 0, '1'),
      param('out', 'hypotheticalIndex', 'string', 0, '*'),
      param('out', 'warning', 'string', 0, '*'),
    ],
  }
);

const CREATE_INDEX_PATTERN = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+/i;

export async function dbExplainHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireExplainAccess();
  const params = parseInputParameters<{
    query: string;
    project?: Reference<Project>;
    analyze?: boolean;
    format?: 'text' | 'json';
    count?: boolean;
    hypotheticalIndex?: string | string[];
  }>(operation, req);
  const searchReq = parseSearchRequest(params.query);
  const repo = ctx.repo.clone();
  repo.setMode(RepositoryMode.READER);
  const selectQuery = getSelectQueryForSearch(repo, searchReq);
  const hypotheticalIndexStatements = parseHypotheticalIndexStatements(params.hypotheticalIndex);
  const warnings: string[] = [];
  const analyze = !!params.analyze;
  if (analyze && hypotheticalIndexStatements.length > 0) {
    warnings.push('EXPLAIN ANALYZE is skipped because HypoPG hypothetical indexes are only considered by EXPLAIN');
  }

  // Capture SQL query and parameters before adding EXPLAIN
  const sqlBuilder = new SqlBuilder();
  selectQuery.buildSql(sqlBuilder);
  const query = sqlBuilder.toString();
  const parameters = sqlBuilder
    .getValues()
    .map((v, i) => `$${i + 1} = ${formatQueryParam(v)}`)
    .join(', ');

  selectQuery.explain = ['settings'];
  if (analyze && hypotheticalIndexStatements.length === 0) {
    selectQuery.explain.push('analyze', 'buffers');
  }
  if (params.format === 'json') {
    selectQuery.explain.push('format json');
  }

  const searchResourceTypes = getSearchResourceTypes(searchReq);
  const { result, countResult, hypotheticalIndexes } = await repo.withStatementTimeout(
    { timeoutMs: 0, resourceTypes: searchResourceTypes },
    async () => {
      return withHypotheticalIndexes(repo, searchResourceTypes, hypotheticalIndexStatements, async () => {
        const result = await repo.executeSql<{ 'QUERY PLAN': string[] }>(
          selectQuery,
          repoAccess.sqlRead(searchResourceTypes, { source: 'dbExplainHandler' })
        );
        const countResult = params.count ? await getCount(repo, searchReq, { forceAccurate: true }) : undefined;
        return { result, countResult };
      });
    }
  );

  let explain: string;
  if (params.format === 'json') {
    explain = result[0]['QUERY PLAN'][0];
    explain = JSON.stringify(explain, (key, value) => (key.endsWith('Blocks') && value === 0 ? undefined : value), 0);
  } else {
    explain = result.map((r) => r['QUERY PLAN']).join('\n');
  }

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
  callback: () => Promise<T>
): Promise<T & { hypotheticalIndexes?: string[] }> {
  if (statements.length === 0) {
    return { ...(await callback()) };
  }

  const access = repoAccess.sqlRead(searchResourceTypes, { source: 'dbExplainHandler' });
  const configAccess = repoAccess.sqlReadConfig(searchResourceTypes, { source: 'dbExplainHandler' });
  let transactionStarted = false;
  try {
    await repo.executeRawSql('BEGIN READ ONLY', undefined, configAccess);
    transactionStarted = true;
    await repo.executeRawSql('SELECT hypopg_reset()', undefined, configAccess);

    const hypotheticalIndexes: string[] = [];
    for (const stmt of statements) {
      const created = await repo.executeRawSql<{ indexrelid: string; indexname: string }>(
        'SELECT indexrelid, indexname FROM hypopg_create_index($1)',
        [stmt],
        access
      );
      for (const row of created) {
        hypotheticalIndexes.push(`${row.indexname}: ${stmt}`);
      }
    }
    const result = await callback();
    return { ...result, hypotheticalIndexes };
  } catch (err) {
    if (isUndefinedFunctionError(err)) {
      throw new OperationOutcomeError(badRequest('hypopg extension is not available on this database'));
    }
    throw err;
  } finally {
    if (transactionStarted) {
      try {
        await repo.executeRawSql('ROLLBACK', undefined, configAccess);
      } catch {
        // Continue to reset connection-private HypoPG state.
      }
    }
    try {
      await repo.executeRawSql('SELECT hypopg_reset()', undefined, configAccess);
    } catch {
      // Preserve the original error when hypopg is missing.
    }
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
