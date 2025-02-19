import { allOk, FileBuilder } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import { buildOutputParameters } from './utils/parameters';
import { buildMigration } from '../../migrations/migrate';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'db-schema-diff',
  status: 'active',
  kind: 'operation',
  code: 'schema-diff',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'out',
      name: 'migrationString',
      type: 'string',
      min: 1,
      max: '1',
    },
  ],
};

export async function dbSchemaDiffHandler(_req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const dbClient = getDatabasePool(DatabaseMode.READER);
  const b = new FileBuilder('  ', false);
  b.append('// The schema migration needed to match the expected schema');
  b.append('');
  await buildMigration(b, { dbClient, dropUnmatchedIndexes: true });
  return [allOk, buildOutputParameters(operation, { migrationString: b.toString() })];
}
