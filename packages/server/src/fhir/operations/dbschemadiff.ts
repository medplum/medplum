// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, FileBuilder } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { DatabaseMode, getDatabasePool } from '../../database';
import {
  generateMigrationActions,
  writeActionsToBuilder,
  writePostDeployActionsToBuilder,
} from '../../migrations/migrate';
import { buildOutputParameters } from './utils/parameters';

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
  const result = await generateMigrationActions({
    dbClient,
    dropUnmatchedIndexes: true,
  });

  const b = new FileBuilder('  ', false);
  b.append('// The schema migration needed to match the expected schema');
  b.append('');

  if (result.preDeployActions.length > 0) {
    b.append('// Pre-deploy migration:');
    writeActionsToBuilder(b, result.preDeployActions);
    b.newLine();
  }

  if (result.postDeployActions.length > 0) {
    b.append('// Post-deploy migration:');
    writePostDeployActionsToBuilder(b, result.postDeployActions);
  }

  return [allOk, buildOutputParameters(operation, { migrationString: b.toString() })];
}
