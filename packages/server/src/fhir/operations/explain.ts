// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, parseSearchRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { RepositoryMode } from '@medplum/fhir-router';
import type { Project, Reference } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { escapeUnicode } from '../../migrations/migrate-utils';
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
      param('out', 'query', 'string', 1, '1'),
      param('out', 'parameters', 'string', 1, '1'),
      param('out', 'explain', 'string', 1, '1'),
      param('out', 'countEstimate', 'integer', 0, '1'),
      param('out', 'countAccurate', 'integer', 0, '1'),
    ],
  }
);

export async function dbExplainHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireSuperAdmin();
  const params = parseInputParameters<{
    query: string;
    project?: Reference<Project>;
    analyze?: boolean;
    format?: 'text' | 'json';
    count?: boolean;
  }>(operation, req);
  const searchReq = parseSearchRequest(params.query);
  const repo = ctx.repo.clone();
  repo.setMode(RepositoryMode.READER);
  const selectQuery = getSelectQueryForSearch(repo, searchReq);

  // Capture SQL query and parameters before adding EXPLAIN
  const sqlBuilder = new SqlBuilder();
  selectQuery.buildSql(sqlBuilder);
  const query = sqlBuilder.toString();
  const parameters = sqlBuilder
    .getValues()
    .map((v, i) => `$${i + 1} = ${formatQueryParam(v)}`)
    .join(', ');

  selectQuery.explain = ['settings'];
  if (params.analyze) {
    selectQuery.explain.push('analyze', 'buffers');
  }
  if (params.format === 'json') {
    selectQuery.explain.push('format json');
  }

  const { result, countResult } = await repo.withStatementTimeout({ timeoutMs: 0 }, async (client) => {
    const result = await selectQuery.execute(client);
    const countResult = params.count ? await getCount(repo, searchReq, { forceAccurate: true }) : undefined;
    return { result, countResult };
  });

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
    explain,
    countEstimate: countResult?.estimate,
    countAccurate: countResult?.accurate,
  });
  return [allOk, output];
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
