import { allOk } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getDatabasePool } from '../../database';
import { buildOutputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-stats',
  status: 'active',
  kind: 'operation',
  code: 'status',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [{ use: 'out', name: 'tableString', type: 'string', min: 1, max: '1' }],
};

export async function dbStatsHandler(_req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const client = getDatabasePool();
  const sql = `
      SELECT * FROM (
        SELECT table_schema, table_name, pg_relation_size('"'||table_schema||'"."'||table_name||'"') AS table_size
        FROM information_schema.tables
      ) tables
      WHERE table_size > 0
      ORDER BY table_size DESC;
      `;

  const result = await client.query(sql);

  const tableString = result.rows.map((row) => `${row.table_schema}.${row.table_name}: ${row.table_size}`).join('\n');

  return [allOk, buildOutputParameters(operation, { tableString })];
}
