import { allOk, parseSearchRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getSelectQueryForSearch } from '../search';
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
      use: 'out',
      name: 'result',
      type: 'string',
      min: 1,
      max: '1',
    },
  ],
};

export async function dbExplainHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = requireSuperAdmin();
  const params = parseInputParameters<{ query: string }>(operation, req);
  const client = getDatabasePool(DatabaseMode.READER); // Send possibly-expensive EXPLAIN queries to reader instances

  const searchReq = parseSearchRequest(params.query);
  const sql = getSelectQueryForSearch(repo, searchReq);
  sql.explain = true;
  sql.analyzeBuffers = true;

  const result = await sql.execute(client);

  const output = buildOutputParameters(operation, { result: result.map((r) => r['QUERY PLAN']).join('\n') });
  return [allOk, output];
}
