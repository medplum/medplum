import { allOk, badRequest, singularize } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { DatabaseMode, getDatabasePool } from '../../database';
import { buildOutputParameters } from './utils/parameters';
import { SqlBuilder } from '../sql';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'pg-sleep',
  status: 'active',
  kind: 'operation',
  code: 'status',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    { use: 'out', name: 'startTime', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'endTime', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'duration', type: 'integer', min: 1, max: '1' },
  ],
};

export async function pgSleepHandler(req: FhirRequest): Promise<FhirResponse> {
  const { duration } = req.query;

  const durationRaw = singularize(duration);
  if (!durationRaw) {
    return [badRequest('duration is required')];
  }

  const durationMs = parseInt(durationRaw, 10);

  if (!(durationMs > 0 && durationMs < 60000)) {
    return [badRequest('Invalid duration')];
  }

  const client = getDatabasePool(DatabaseMode.WRITER);

  const startTime = Date.now();
  await client.query('BEGIN');
  const sql = new SqlBuilder();
  sql.append('SELECT pg_sleep(');
  sql.appendParameters(durationMs / 1000, false);
  sql.append(')');
  await sql.execute(client);
  await client.query('COMMIT');
  const endTime = Date.now();

  return [allOk, buildOutputParameters(operation, { startTime, endTime, duration: endTime - startTime })];
}
