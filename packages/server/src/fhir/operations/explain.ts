// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, parseSearchRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition, Project, Reference } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode } from '../../database';
import { escapeUnicode } from '../../migrations/migrate-utils';
import { withLongRunningDatabaseClient } from '../../migrations/migration-utils';
import { getSelectQueryForSearch } from '../search';
import { SqlBuilder } from '../sql';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-explain',
  status: 'active',
  kind: 'operation',
  code: 'explain',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'query',
      type: 'string',
      min: 1,
      max: '1',
    },
    {
      use: 'in',
      name: 'analyze',
      type: 'boolean',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'format',
      type: 'string',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'query',
      type: 'string',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'parameters',
      type: 'string',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'explain',
      type: 'string',
      min: 1,
      max: '1',
    },
  ],
};

export async function dbExplainHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = requireSuperAdmin();
  const params = parseInputParameters<{
    query: string;
    project?: Reference<Project>;
    analyze?: boolean;
    format?: 'text' | 'json';
  }>(operation, req);
  const searchReq = parseSearchRequest(params.query);
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

  const result = await withLongRunningDatabaseClient((client) => selectQuery.execute(client), DatabaseMode.READER);

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
